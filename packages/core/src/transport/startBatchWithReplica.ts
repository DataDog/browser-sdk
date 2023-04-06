import type { Configuration, EndpointBuilder } from '../domain/configuration'
import type { RawError } from '../domain/error/error'
import type { Context } from '../tools/serialisation/context'
import type { Observable } from '../tools/observable'
import type { PageExitEvent } from '../browser/pageExitObservable'
import { Batch } from './batch'
import { createHttpRequest } from './httpRequest'
import { createFlushController } from './flushController'

export function startBatchWithReplica<T extends Context>(
  configuration: Configuration,
  endpoint: EndpointBuilder,
  reportError: (error: RawError) => void,
  pageExitObservable: Observable<PageExitEvent>,
  replicaEndpoint?: EndpointBuilder
) {
  const primaryBatch = createBatch(endpoint)
  let replicaBatch: Batch | undefined
  if (replicaEndpoint) {
    replicaBatch = createBatch(replicaEndpoint)
  }

  function createBatch(endpointBuilder: EndpointBuilder) {
    return new Batch(
      createHttpRequest(endpointBuilder, configuration.batchBytesLimit, reportError),
      createFlushController({
        messagesLimit: configuration.batchMessagesLimit,
        bytesLimit: configuration.batchBytesLimit,
        durationLimit: configuration.flushTimeout,
        pageExitObservable,
      }),
      configuration.messageBytesLimit
    )
  }

  return {
    add(message: T, replicated = true) {
      primaryBatch.add(message)
      if (replicaBatch && replicated) {
        replicaBatch.add(message)
      }
    },
  }
}
