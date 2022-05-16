import type { Configuration, EndpointBuilder } from '../domain/configuration'
import type { Context } from '../tools/context'
import { Batch, HttpRequest } from './index'

export function startBatchWithReplica<T extends Context>(
  configuration: Configuration,
  endpoint: EndpointBuilder,
  replicaEndpoint?: EndpointBuilder
) {
  const primaryBatch = createBatch(endpoint)
  let replicaBatch: Batch | undefined
  if (replicaEndpoint) {
    replicaBatch = createBatch(replicaEndpoint)
  }

  function createBatch(endpointBuilder: EndpointBuilder) {
    return new Batch(
      new HttpRequest(endpointBuilder, configuration.batchBytesLimit),
      configuration.batchMessagesLimit,
      configuration.batchBytesLimit,
      configuration.messageBytesLimit,
      configuration.flushTimeout
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
