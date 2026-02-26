import type { Observable, RawError, PageMayExitEvent, Encoder } from '@datadog/browser-core'
import { createBatch, createFlushController, createHttpRequest, DeflateEncoderStreamId } from '@datadog/browser-core'
import type { Pipeline } from '@datadog/browser-core-next'
import type { RumConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { RumCoreEvents } from '../domain/pipeline/rumPipelineEvents'
import type { AssembledRumEvent } from '../rawRumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import { toServerFormat } from '../domain/pipeline/toServerFormat'

export function startRumBatch(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  sessionExpireObservable: Observable<void>,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder,
  pipeline?: Pipeline<RumCoreEvents>
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

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent: AssembledRumEvent) => {
    if (serverRumEvent.type === RumEventType.VIEW) {
      batch.upsert(serverRumEvent, serverRumEvent.view.id)
    } else {
      batch.add(serverRumEvent)
    }
  })

  if (pipeline) {
    pipeline.subscribe('observation', (enrichedObservation) => {
      const serverEvent = toServerFormat(enrichedObservation as any)
      if (serverEvent.type === RumEventType.VIEW) {
        batch.upsert(serverEvent, (serverEvent as any).view?.id)
      } else {
        batch.add(serverEvent)
      }
    })
  }

  return batch
}
