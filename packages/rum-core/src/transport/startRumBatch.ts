import type { Observable, RawError, PageMayExitEvent, Encoder } from '@datadog/browser-core'
import { createBatch, createFlushController, createHttpRequest, DeflateEncoderStreamId } from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { AssembledRumEvent } from '../rawRumEvent.types'
import { RumEventType } from '../rawRumEvent.types'

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

  // Store last assembled VIEW event per view_id for post-assembly strip
  const assembledViewSnapshots = new Map<string, AssembledRumEvent>()

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent: AssembledRumEvent) => {
    if (serverRumEvent.type === RumEventType.VIEW) {
      // Store snapshot for future view_update strip
      assembledViewSnapshots.set(serverRumEvent.view.id, serverRumEvent)
      batch.upsert(serverRumEvent, serverRumEvent.view.id)

      // Cleanup on view end
      if (!serverRumEvent.view.is_active) {
        assembledViewSnapshots.delete(serverRumEvent.view.id)
      }
    } else if (serverRumEvent.type === RumEventType.VIEW_UPDATE) {
      const snapshot = assembledViewSnapshots.get(serverRumEvent.view.id)
      const stripped = snapshot ? stripUnchangedFields(serverRumEvent, snapshot) : serverRumEvent
      batch.add(stripped)
    } else {
      batch.add(serverRumEvent)
    }
  })

  return batch
}

function stripUnchangedFields(
  viewUpdate: AssembledRumEvent & { type: typeof RumEventType.VIEW_UPDATE },
  snapshot: AssembledRumEvent
): AssembledRumEvent {
  const result = { ...viewUpdate } as any
  const snap = snapshot as any
  const update = viewUpdate as any

  // Strip top-level fields if equal to snapshot
  const strippable = ['context', 'connectivity', 'usr', 'account'] as const
  for (const field of strippable) {
    if (JSON.stringify(update[field]) === JSON.stringify(snap[field])) {
      delete result[field]
    }
  }

  // Strip display.viewport if unchanged (but keep display.scroll if present)
  if (update.display?.viewport && snap.display?.viewport &&
      JSON.stringify(update.display.viewport) === JSON.stringify(snap.display.viewport)) {
    const { viewport, ...restDisplay } = result.display
    result.display = Object.keys(restDisplay).length > 0 ? restDisplay : undefined
  }

  // Strip view.url and view.referrer if unchanged
  if (update.view?.url === snap.view?.url && update.view?.referrer === snap.view?.referrer) {
    const { url, referrer, ...restView } = result.view
    result.view = restView
  }

  // Strip service, version, source if unchanged
  for (const field of ['service', 'version', 'source'] as const) {
    if (update[field] === snap[field]) {
      delete result[field]
    }
  }

  return result as AssembledRumEvent
}
