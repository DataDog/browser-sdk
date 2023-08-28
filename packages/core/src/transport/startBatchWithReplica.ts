import type { Configuration, EndpointBuilder } from '../domain/configuration'
import type { Context } from '../tools/serialisation/context'
import type { Observable } from '../tools/observable'
import type { PageExitEvent } from '../browser/pageExitObservable'
import type { RawError } from '../domain/error/error.types'
import { Batch } from './batch'
import { createHttpRequest } from './httpRequest'
import { createFlushController } from './flushController'

export function startBatchWithReplica<T extends Context>(
  configuration: Configuration,
  primary: { endpoint: EndpointBuilder },
  replica: { endpoint: EndpointBuilder; transformMessage?: (message: T) => T } | undefined,
  reportError: (error: RawError) => void,
  pageExitObservable: Observable<PageExitEvent>,
  sessionExpireObservable: Observable<void>
) {
  const primaryBatch = createBatch(configuration, primary.endpoint)
  const replicaBatch = replica && createBatch(configuration, replica.endpoint)

  function createBatch(configuration: Configuration, endpointBuilder: EndpointBuilder) {
    return new Batch(
      createHttpRequest(configuration, endpointBuilder, configuration.batchBytesLimit, reportError),
      createFlushController({
        messagesLimit: configuration.batchMessagesLimit,
        bytesLimit: configuration.batchBytesLimit,
        durationLimit: configuration.flushTimeout,
        pageExitObservable,
        sessionExpireObservable,
      }),
      configuration.messageBytesLimit
    )
  }

  return {
    flushObservable: primaryBatch.flushController.flushObservable,

    add(message: T, replicated = true) {
      primaryBatch.add(message)
      if (replicaBatch && replicated) {
        replicaBatch.add(replica.transformMessage ? replica.transformMessage(message) : message)
      }
    },

    upsert: (message: T, key: string) => {
      primaryBatch.upsert(message, key)
      if (replicaBatch) {
        replicaBatch.upsert(replica.transformMessage ? replica.transformMessage(message) : message, key)
      }
    },
  }
}
