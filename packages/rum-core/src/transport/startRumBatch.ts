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
} from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { AssembledRumEvent } from '../rawRumEvent.types'
import type { RumViewEvent, RumViewUpdateEvent } from '../rumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import { diffMerge } from '../domain/view/viewDiff'

export const PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL = 100

export function assembleViewUpdateEvent(
  current: RumViewEvent,
  last: RumViewEvent
): (RumViewUpdateEvent & Context) | undefined {
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

  // Restore the ignoreKeys — backend needs them on every event
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
  }) as RumViewUpdateEvent & Context
}

export function startRumBatch(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  sessionExpireObservable: Observable<void>,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
) {
  const endpoints = [configuration.rumEndpointBuilder]
  if (configuration.replica) {
    endpoints.push(configuration.replica.rumEndpointBuilder)
  }

  const batch = createBatch({
    encoder: createEncoder(DeflateEncoderStreamId.RUM),
    request: createHttpRequest(endpoints, reportError),
    flushController: createFlushController({
      pageMayExitObservable,
      sessionExpireObservable,
    }),
  })

  let lastSentView: RumViewEvent | undefined
  let viewUpdatesSinceCheckpoint = 0

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent: AssembledRumEvent) => {
    if (serverRumEvent.type !== RumEventType.VIEW) {
      // Non-view events: always append
      batch.add(serverRumEvent)
      return
    }

    const viewEvent = serverRumEvent as RumViewEvent

    if (!isExperimentalFeatureEnabled(ExperimentalFeature.PARTIAL_VIEW_UPDATES)) {
      // Feature OFF: existing behavior — upsert full view
      batch.upsert(viewEvent as unknown as Context, viewEvent.view.id)
      return
    }

    const viewId = viewEvent.view.id

    // View ended (is_active: false) — always send a full view for backend recovery
    if (!viewEvent.view.is_active) {
      lastSentView = undefined
      viewUpdatesSinceCheckpoint = 0
      batch.upsert(viewEvent as unknown as Context, viewId)
      return
    }

    // New view started
    if (viewId !== lastSentView?.view.id) {
      lastSentView = viewEvent
      viewUpdatesSinceCheckpoint = 0
      batch.upsert(viewEvent as unknown as Context, viewId)
      return
    }

    // Checkpoint: every N intermediate updates, send a full view
    viewUpdatesSinceCheckpoint += 1
    if (viewUpdatesSinceCheckpoint >= PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL) {
      viewUpdatesSinceCheckpoint = 0
      lastSentView = viewEvent
      batch.upsert(viewEvent as unknown as Context, viewId)
      return
    }

    // Intermediate update: compute diff and send view_update.
    // Note: view_update events are created here, post-assembly, and go directly to batch.add().
    // They intentionally bypass RAW_RUM_EVENT_COLLECTED → assembly → RUM_EVENT_COLLECTED, which
    // means they skip beforeSend entirely. view_update is an internal bandwidth optimization —
    // not a customer-visible event type, and not modifiable via beforeSend.
    const diff = assembleViewUpdateEvent(viewEvent, lastSentView)
    lastSentView = viewEvent
    if (diff) {
      sendToExtension('rum', diff)
      batch.add(diff)
    }
    // If diff is undefined (nothing changed), skip — no event emitted
  })

  return batch
}
