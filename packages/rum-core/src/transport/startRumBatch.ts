import type { Observable, RawError, PageMayExitEvent, Encoder } from '@datadog/browser-core'
import { createBatch, createFlushController, createHttpRequest, DeflateEncoderStreamId } from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { AssembledRumEvent } from '../rawRumEvent.types'
import { RumEventType } from '../rawRumEvent.types'

// Required fields that must always be present in VIEW_UPDATE for routing and correlation.
const REQUIRED_TOP_LEVEL = new Set(['type', 'date', 'application', 'session'])
const REQUIRED_VIEW_FIELDS = new Set(['id'])
const REQUIRED_DD_FIELDS = new Set(['document_version'])

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

export function stripViewUpdateFields(viewUpdate: AssembledRumEvent, lastView: AssembledRumEvent): AssembledRumEvent {
  const stripped: Record<string, unknown> = { ...viewUpdate }

  // Strip top-level fields (except required ones and nested objects handled below)
  for (const key of Object.keys(stripped)) {
    if (REQUIRED_TOP_LEVEL.has(key) || key === 'view' || key === '_dd' || key === 'display') {
      continue
    }
    if (deepEqual(stripped[key], (lastView as unknown as Record<string, unknown>)[key])) {
      delete stripped[key]
    }
  }

  // Strip view.* sub-fields (keep required: id)
  if (viewUpdate.view && lastView.view) {
    const strippedView: Record<string, unknown> = { ...(viewUpdate.view as Record<string, unknown>) }
    for (const key of Object.keys(strippedView)) {
      if (REQUIRED_VIEW_FIELDS.has(key)) continue
      if (deepEqual(strippedView[key], (lastView.view as unknown as Record<string, unknown>)[key])) {
        delete strippedView[key]
      }
    }
    stripped.view = strippedView
  }

  // Strip _dd.* sub-fields (keep required: document_version)
  if (viewUpdate._dd && lastView._dd) {
    const strippedDd: Record<string, unknown> = { ...(viewUpdate._dd as Record<string, unknown>) }
    for (const key of Object.keys(strippedDd)) {
      if (REQUIRED_DD_FIELDS.has(key)) continue
      if (deepEqual(strippedDd[key], (lastView._dd as unknown as Record<string, unknown>)[key])) {
        delete strippedDd[key]
      }
    }
    stripped._dd = strippedDd
  }

  // Strip display.* sub-fields; remove display entirely if it becomes empty
  const viewUpdateDisplay = (viewUpdate as unknown as Record<string, unknown>).display as
    | Record<string, unknown>
    | undefined
  const lastViewDisplay = (lastView as unknown as Record<string, unknown>).display as
    | Record<string, unknown>
    | undefined
  if (viewUpdateDisplay && lastViewDisplay) {
    const strippedDisplay: Record<string, unknown> = { ...viewUpdateDisplay }
    for (const key of Object.keys(strippedDisplay)) {
      if (deepEqual(strippedDisplay[key], lastViewDisplay[key])) {
        delete strippedDisplay[key]
      }
    }
    if (Object.keys(strippedDisplay).length === 0) {
      delete stripped.display
    } else {
      stripped.display = strippedDisplay
    }
  }

  return stripped as unknown as AssembledRumEvent
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

  let lastAssembledView: AssembledRumEvent | undefined

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent: AssembledRumEvent) => {
    if (serverRumEvent.type === RumEventType.VIEW) {
      lastAssembledView = serverRumEvent
      batch.upsert(serverRumEvent, serverRumEvent.view.id)
    } else if (serverRumEvent.type === RumEventType.VIEW_UPDATE) {
      const toSend = lastAssembledView ? stripViewUpdateFields(serverRumEvent, lastAssembledView) : serverRumEvent
      batch.add(toSend)
    } else {
      batch.add(serverRumEvent)
    }
  })

  return batch
}
