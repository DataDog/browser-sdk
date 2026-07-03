import type { Observable, Encoder, Context } from '@datadog/browser-core'
import { createBatch, DeflateEncoderStreamId, sendToExtension } from '@datadog/browser-core'
import { combine } from '@datadog/js-core/util'
import { createEndpointBuilder, createReplicaEndpointBuilder } from '@datadog/js-core/transport'
import type { RumConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { AssembledRumEvent } from '../rawRumEvent.types'
import type { RumViewEvent, RumViewUpdateEvent } from '../rumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import { diffMerge } from '../domain/view/viewDiff'

export const PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL = 100

export type AssembledViewDiff = Omit<RumViewUpdateEvent, 'view' | '_dd'> & {
  view: Partial<RumViewEvent['view']> & { id: string; url: string }
  _dd?: { document_version: number; format_version: number; [k: string]: unknown }
}

export function computeAssembledViewDiff(current: RumViewEvent, last: RumViewEvent): AssembledViewDiff | undefined {
  const diff = diffMerge(current, last, {
    // context, connectivity, usr, device, privacy are objects — use REPLACE to avoid partial updates
    replaceKeys: new Set(['view.custom_timings', 'context', 'connectivity', 'usr', 'device', 'privacy']),
    appendKeys: new Set(['_dd.page_states']),
    // Ignore always-required fields — they are added back via combine regardless of changes
    ignoreKeys: new Set([
      'date',
      'type',
      'application',
      'session',
      'view.id',
      'view.url',
      '_dd.document_version',
      '_dd.format_version',
    ]),
  })

  if (!diff) {
    return undefined
  }

  // Merge always-required fields on top of the diff for backend routing
  return combine(diff, {
    type: RumEventType.VIEW_UPDATE,
    date: current.date,
    application: current.application,
    session: current.session,
    view: {
      id: current.view.id,
      url: current.view.url,
    },
    _dd: {
      document_version: current._dd.document_version,
      format_version: current._dd.format_version,
    },
  })
}

/**
 * Dispatches assembled RUM events to the batch. VIEW events are handled specially:
 * intermediate updates either replace the full VIEW already in the batch, or are
 * aggregated into a single view_update diff against the last flushed state.
 */
export function createBatchDispatcher(
  batch: Pick<ReturnType<typeof createBatch>, 'flushObservable' | 'isEmpty' | 'add' | 'upsert'>,
  enableViewUpdates: boolean
): { dispatch: (event: AssembledRumEvent) => void; stop: () => void } {
  let lastSentView: RumViewEvent | undefined
  // Base used to compute the aggregate diff for the current batch's view_update.
  // Reset to lastSentView on each flush (= what the backend received in the previous batch).
  let batchBase: RumViewEvent | undefined
  // True when the current batch already contains a full VIEW event for the active view.
  // Reset to false on each flush.
  let batchHasFullView = false
  let viewUpdatesSinceCheckpoint = 0

  // On flush: advance batchBase to lastSentView (what the backend now has) and clear the flag.
  // lastSentView is set AFTER batch.upsert() in the new-view and checkpoint paths so that if
  // upsert() triggers a sync flush, the subscriber captures the previous view (what the backend
  // actually received), not the one being added.
  const { unsubscribe } = batch.flushObservable.subscribe(() => {
    batchHasFullView = false
    batchBase = lastSentView
  })

  return {
    dispatch: (serverRumEvent: AssembledRumEvent) => {
      if (serverRumEvent.type !== RumEventType.VIEW) {
        // Non-view events: always append
        batch.add(serverRumEvent)
        return
      }

      if (!enableViewUpdates) {
        // Feature OFF: existing behavior — upsert full view
        batch.upsert(serverRumEvent, serverRumEvent.view.id)
        return
      }

      const viewId = serverRumEvent.view.id

      // View ended (is_active: false) — always send a full VIEW.
      // Checked before the new-view guard so that a stale view-end for an old view
      // (arriving after a new view has already started) is handled correctly: we upsert
      // it without touching the state of the current view.
      if (!serverRumEvent.view.is_active) {
        if (viewId === lastSentView?.view.id) {
          // Current view ended — reset all state
          lastSentView = undefined
          batchBase = undefined
          batchHasFullView = false
          viewUpdatesSinceCheckpoint = 0
        }
        batch.upsert(serverRumEvent, viewId)
        return
      }

      // New view started
      if (viewId !== lastSentView?.view.id) {
        viewUpdatesSinceCheckpoint = 0
        batch.upsert(serverRumEvent, viewId)
        // lastSentView set AFTER upsert: if upsert triggers a sync flush, the subscriber
        // captures the old lastSentView as batchBase (what the backend actually received),
        // not the new view that hasn't been sent yet.
        lastSentView = serverRumEvent
        // If upsert triggered an after-add flush (e.g. messages_limit), the VIEW was sent
        // and the batch is now empty — isEmpty is true. Otherwise the VIEW is in the batch.
        batchHasFullView = !batch.isEmpty
        return
      }

      // Intermediate update
      lastSentView = serverRumEvent

      if (batchHasFullView) {
        // Optimization 1: batch already has a full VIEW — replace it with the latest full view.
        // This is equivalent to the non-experimental upsert behavior for in-flight batches.
        batch.upsert(serverRumEvent, viewId)
        return
      }

      // Optimization 2: no full VIEW in the current batch — compute an aggregate diff from
      // batchBase (last state the backend received) and upsert it under the same key as the VIEW.
      // Each update replaces the previous aggregate, so the batch always contains at most one
      // view_update per view ID.
      //
      // Note: view_update events are created here, post-assembly, bypassing
      // RAW_RUM_EVENT_COLLECTED → assembly → RUM_EVENT_COLLECTED. They intentionally skip
      // beforeSend — view_update is an internal bandwidth optimization, not a customer-visible type.

      // Checkpoint: periodically send a full VIEW for backend reliability.
      // When the checkpoint fires, upsert(VIEW) replaces any pending view_update (same key).
      viewUpdatesSinceCheckpoint += 1
      if (viewUpdatesSinceCheckpoint >= PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL) {
        viewUpdatesSinceCheckpoint = 0
        batch.upsert(serverRumEvent, viewId)
        batchHasFullView = !batch.isEmpty
        return
      }

      if (batchBase) {
        const diff = computeAssembledViewDiff(serverRumEvent, batchBase)
        if (diff) {
          sendToExtension('rum', diff)
          batch.upsert(diff as unknown as Context, viewId)
        }
      }
    },
    stop: unsubscribe,
  }
}

export function startRumBatch(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  reportError: (message: string) => void,
  sessionExpireObservable: Observable<void>,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
) {
  const endpoints = [createEndpointBuilder(configuration, 'rum')]
  const replicaEndpoint = createReplicaEndpointBuilder(configuration, 'rum')
  if (replicaEndpoint) {
    endpoints.push(replicaEndpoint)
  }

  const batch = createBatch({
    encoder: createEncoder(DeflateEncoderStreamId.RUM),
    endpoints,
    reportError,
  })
  sessionExpireObservable.subscribe(() => batch.forceFlush('session_expire'))

  const { dispatch, stop: stopDispatcher } = createBatchDispatcher(batch, configuration.betaEnableViewUpdates)
  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, dispatch)

  const stopBatch = batch.stop.bind(batch)
  batch.stop = () => {
    stopDispatcher()
    stopBatch()
  }

  return batch
}
