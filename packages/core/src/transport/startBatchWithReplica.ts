import type { Configuration, EndpointBuilder } from '../domain/configuration'
import type { RawError } from '../tools/error'
import type { Context } from '../tools/context'
import { Batch } from './batch'
import { createHttpRequest } from './httpRequest'

export function startBatchWithReplica<T extends Context>(
  configuration: Configuration,
  endpoint: EndpointBuilder,
  reportError: (error: RawError) => void,
  replicaEndpoint?: EndpointBuilder
) {
  const primaryBatch = createBatch(endpoint, true)
  let replicaBatch: Batch | undefined
  if (replicaEndpoint) {
    replicaBatch = createBatch(replicaEndpoint, false)
  }

  function createBatch(endpointBuilder: EndpointBuilder, toPrimaryEndpoint: boolean) {
    return new Batch(
      createHttpRequest(endpointBuilder, configuration.batchBytesLimit, reportError, toPrimaryEndpoint),
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
