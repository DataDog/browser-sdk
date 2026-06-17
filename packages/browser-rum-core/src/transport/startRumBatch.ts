import type { Observable, RawError, PageMayExitEvent, Encoder, Context } from '@datadog/browser-core'
import {
  combine,
  createBatch,
  createFlushController,
  createHttpRequest,
  DeflateEncoderStreamId,
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
  sendToExtension,
  createEndpointBuilder,
  createReplicaEndpointBuilder,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { AssembledRumEvent } from '../rawRumEvent.types'
import type { RumViewEvent, RumViewUpdateEvent } from '../rumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import { diffMerge } from '../domain/view/viewDiff'

export const PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL = 100

export function computeAssembledViewDiff(current: RumViewEvent, last: RumViewEvent): RumViewUpdateEvent | undefined {
  const currentObj = current as unknown as Record<string, unknown>
  const lastObj = last as unknown as Record<string, unknown>

  const diff = diffMerge(currentObj, lastObj, {
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

  const currentView = currentObj.view as Record<string, unknown>
  const currentDd = currentObj._dd as Record<string, unknown>

  // Merge always-required fields on top of the diff for backend routing
  return combine(diff, {
    type: RumEventType.VIEW_UPDATE,
    date: currentObj.date,
    application: currentObj.application,
    session: currentObj.session,
    view: {
      id: currentView.id,
      url: currentView.url,
    },
    _dd: {
      document_version: currentDd.document_version,
      format_version: currentDd.format_version,
    },
  }) as unknown as RumViewUpdateEvent
}

/**
 * Creates the VIEW routing handler for the RUM batch.
 *
 * Two optimizations over the naive "always upsert full view" approach:
 *
 * Optimization 1 — VIEW already in batch:
 * Intermediate updates upsert the latest full VIEW (same key), keeping a single up-to-date
 * entry. No view_update event is emitted. Equivalent to the non-experimental path.
 *
 * Optimization 2 — no VIEW in batch (post-flush):
 * Intermediate updates compute an aggregate diff from batchBase (the state the backend
 * received in the last batch) and upsert it under the same key. Multiple updates in the
 * same batch produce one view_update, not N.
 *
 * On each flush, batchHasFullView resets and batchBase advances to lastSentView.
 * The checkpoint (every N updates in opt-2) upserts a full VIEW, replacing any pending
 * view_update under the same key.
 */
export function createViewBatchRouter(
  batch: Pick<ReturnType<typeof createBatch>, 'flushController' | 'add' | 'upsert'>
): { route: (event: AssembledRumEvent) => void; stop: () => void } {
  let lastSentView: RumViewEvent | undefined
  // Base used to compute the aggregate diff for the current batch's view_update.
  // Reset to lastSentView on each flush (= what the backend received in the previous batch).
  let batchBase: RumViewEvent | undefined
  // True when the current batch already contains a full VIEW event for the active view.
  // Reset to false on each flush.
  let batchHasFullView = false
  let viewUpdatesSinceCheckpoint = 0

  // On flush: advance batchBase to lastSentView (what the backend now has) and clear the flag.
  // State updates in the route function are applied AFTER batch.upsert() so they always win
  // over this subscriber even when upsert() triggers a synchronous flush (e.g. bytes limit reached).
  const { unsubscribe } = batch.flushController.flushObservable.subscribe(() => {
    batchHasFullView = false
    batchBase = lastSentView
  })

  return {
    route: (serverRumEvent: AssembledRumEvent) => {
      if (serverRumEvent.type !== RumEventType.VIEW) {
        // Non-view events: always append
        batch.add(serverRumEvent)
        return
      }

      if (!isExperimentalFeatureEnabled(ExperimentalFeature.PARTIAL_VIEW_UPDATES)) {
        // Feature OFF: existing behavior — upsert full view
        batch.upsert(serverRumEvent, serverRumEvent.view.id)
        return
      }

      const viewId = serverRumEvent.view.id

      // New view started
      if (viewId !== lastSentView?.view.id) {
        viewUpdatesSinceCheckpoint = 0
        batch.upsert(serverRumEvent, viewId)
        // State set after upsert: if upsert triggers a sync flush, the flush subscriber runs
        // first (resetting batchHasFullView to false), then these assignments restore the
        // correct state for the fresh batch that now contains this VIEW.
        lastSentView = serverRumEvent
        batchBase = serverRumEvent
        batchHasFullView = true
        return
      }

      // View ended (is_active: false)
      if (!serverRumEvent.view.is_active) {
        lastSentView = undefined
        batchBase = undefined
        batchHasFullView = false
        viewUpdatesSinceCheckpoint = 0
        batch.upsert(serverRumEvent, viewId)
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
        // State set after upsert for the same sync-flush reason as the new-view case above.
        batchHasFullView = true
        batchBase = serverRumEvent
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
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
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
    request: createHttpRequest(endpoints, reportError),
    flushController: createFlushController({
      pageMayExitObservable,
      sessionExpireObservable,
    }),
  })

  const { route, stop: stopRouter } = createViewBatchRouter(batch)
  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, route)

  const originalBatchStop = batch.stop.bind(batch)
  batch.stop = () => {
    stopRouter()
    originalBatchStop()
  }

  return batch
}
