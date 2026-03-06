import type { Observable, RawError, PageMayExitEvent, Encoder } from '@datadog/browser-core'
import {
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
import { RumEventType } from '../rawRumEvent.types'
import { diffMerge, isEqual } from '../domain/view/viewDiff'

export const PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL = 10

// Top-level assembled fields that should be diffed with simple equality
const ASSEMBLED_TOP_LEVEL_FIELDS = ['service', 'version', 'source', 'ddtags', 'context', 'connectivity', 'usr', 'device', 'privacy'] as const

export function computeAssembledViewDiff(
  current: AssembledRumEvent,
  last: AssembledRumEvent
): AssembledRumEvent | undefined {
  const currentObj = current as unknown as Record<string, unknown>
  const lastObj = last as unknown as Record<string, unknown>

  const result: Record<string, unknown> = {
    type: RumEventType.VIEW_UPDATE,
    date: currentObj.date,
    application: currentObj.application,
    session: currentObj.session,
  }

  let hasChanges = false

  // --- view.* diff (MERGE strategy, nested-aware) ---
  const currentView = currentObj.view as Record<string, unknown>
  const lastView = lastObj.view as Record<string, unknown>
  const viewResult: Record<string, unknown> = { id: currentView.id }

  const viewDiff = diffMerge(currentView, lastView, { replaceKeys: new Set(['custom_timings']) })
  if (viewDiff) {
    delete viewDiff.id // already in required fields
    Object.assign(viewResult, viewDiff)
    if (Object.keys(viewDiff).length > 0) {
      hasChanges = true
    }
  }
  result.view = viewResult

  // --- _dd.* diff (MERGE strategy, page_states APPEND) ---
  const currentDd = currentObj._dd as Record<string, unknown>
  const lastDd = lastObj._dd as Record<string, unknown>
  const ddResult: Record<string, unknown> = { document_version: currentDd.document_version }

  const ddDiff = diffMerge(currentDd, lastDd, { appendKeys: new Set(['page_states']) })
  if (ddDiff) {
    delete ddDiff.document_version // already in required fields
    Object.assign(ddResult, ddDiff)
    if (Object.keys(ddDiff).length > 0) {
      hasChanges = true
    }
  }
  result._dd = ddResult

  // --- display.* diff (MERGE strategy) ---
  const currentDisplay = currentObj.display as Record<string, unknown> | undefined
  const lastDisplay = lastObj.display as Record<string, unknown> | undefined
  if (currentDisplay && lastDisplay) {
    const displayDiff = diffMerge(currentDisplay, lastDisplay)
    if (displayDiff && Object.keys(displayDiff).length > 0) {
      result.display = displayDiff
      hasChanges = true
    }
  } else if (currentDisplay && !lastDisplay) {
    result.display = currentDisplay
    hasChanges = true
  } else if (!currentDisplay && lastDisplay) {
    result.display = null // signal deletion
    hasChanges = true
  }

  // --- Top-level assembled fields (REPLACE strategy) ---
  for (const key of ASSEMBLED_TOP_LEVEL_FIELDS) {
    const currentVal = currentObj[key]
    const lastVal = lastObj[key]
    if (!isEqual(currentVal, lastVal)) {
      result[key] = currentVal
      hasChanges = true
    }
  }

  if (!hasChanges) {
    return undefined
  }

  return result as unknown as AssembledRumEvent
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
  let currentViewId: string | undefined
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
    if (viewId !== currentViewId) {
      currentViewId = viewId
      lastSentView = serverRumEvent
      viewUpdatesSinceCheckpoint = 0
      batch.upsert(serverRumEvent, viewId)
      return
    }

    // View ended (is_active: false)
    if (!(serverRumEvent.view as any).is_active) {
      currentViewId = undefined
      lastSentView = undefined
      viewUpdatesSinceCheckpoint = 0
      batch.upsert(serverRumEvent, viewId)
      return
    }

    // Checkpoint: every N intermediate updates, send a full view
    viewUpdatesSinceCheckpoint += 1
    if (viewUpdatesSinceCheckpoint >= PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL) {
      viewUpdatesSinceCheckpoint = 0
      lastSentView = serverRumEvent
      batch.upsert(serverRumEvent, viewId)
      return
    }

    // Intermediate update: compute diff and send view_update
    if (!lastSentView) {
      // Safety fallback (should not happen in practice)
      lastSentView = serverRumEvent
      batch.upsert(serverRumEvent, viewId)
      return
    }

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
