import type { Observable, RawError, PageMayExitEvent, Encoder } from '@datadog/browser-core'
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
import type { RumViewEvent } from '../rumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import { diffMerge } from '../domain/view/viewDiff'

export const PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL = 100

export function computeAssembledViewDiff(
  current: AssembledRumEvent,
  last: AssembledRumEvent
): AssembledRumEvent | undefined {
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
  }) as unknown as AssembledRumEvent
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

  let lastSentView: AssembledRumEvent | undefined
  let viewUpdatesSinceCheckpoint = 0

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent: AssembledRumEvent) => {
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
      lastSentView = serverRumEvent
      viewUpdatesSinceCheckpoint = 0
      batch.upsert(serverRumEvent, viewId)
      return
    }

    // View ended (is_active: false)
    if (!(serverRumEvent as RumViewEvent).view.is_active) {
      lastSentView = undefined
      viewUpdatesSinceCheckpoint = 0
      batch.upsert(serverRumEvent, viewId)
      return
    }

    // Checkpoint: every N intermediate updates, send a full view (unless disabled by flag)
    if (!isExperimentalFeatureEnabled(ExperimentalFeature.PARTIAL_VIEW_UPDATES_NO_CHECKPOINT)) {
      viewUpdatesSinceCheckpoint += 1
      if (viewUpdatesSinceCheckpoint >= PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL) {
        viewUpdatesSinceCheckpoint = 0
        lastSentView = serverRumEvent
        batch.upsert(serverRumEvent, viewId)
        return
      }
    }

    // Intermediate update: compute diff and send view_update.
    // Note: view_update events are created here, post-assembly, and go directly to batch.add().
    // They intentionally bypass RAW_RUM_EVENT_COLLECTED → assembly → RUM_EVENT_COLLECTED, which
    // means they skip beforeSend entirely. view_update is an internal bandwidth optimization —
    // not a customer-visible event type, and not modifiable via beforeSend.
    const diff = computeAssembledViewDiff(serverRumEvent, lastSentView)
    lastSentView = serverRumEvent
    if (diff) {
      sendToExtension('rum', diff)
      batch.add(diff)
    }
    // If diff is undefined (nothing changed), skip — no event emitted
  })

  return batch
}
