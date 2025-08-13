import type { Context, Observable, RawError, PageMayExitEvent, Encoder } from '@datadog/browser-core'
import { createBatch, createFlushController, createHttpRequest, DeflateEncoderStreamId } from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import { RumEventType } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'

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
    request: createHttpRequest(endpoints, configuration.batchBytesLimit, reportError),
    flushController: createFlushController({
      messagesLimit: configuration.batchMessagesLimit,
      bytesLimit: configuration.batchBytesLimit,
      durationLimit: configuration.flushTimeout,
      pageMayExitObservable,
      sessionExpireObservable,
    }),
    messageBytesLimit: configuration.messageBytesLimit,
  })

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent: RumEvent & Context) => {
    if (serverRumEvent.type === RumEventType.VIEW) {
      batch.upsert(serverRumEvent, serverRumEvent.view.id)
    } else {
      batch.add(serverRumEvent)
    }
  })

  return batch
}
