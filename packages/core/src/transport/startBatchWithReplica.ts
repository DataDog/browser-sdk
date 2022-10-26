import type { Configuration, EndpointBuilder } from '../domain/configuration'
import type { RawError } from '../tools/error'
import type { Context } from '../tools/context'
import type { PageState } from '../browser/pageState'
import { Batch } from './batch'
import { createHttpRequest } from './httpRequest'

export function startBatchWithReplica<T extends Context>(
  configuration: Configuration,
  endpoint: EndpointBuilder,
  reportError: (error: RawError) => void,
  pageState: PageState,
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
      configuration.batchMessagesLimit,
      configuration.batchBytesLimit,
      configuration.messageBytesLimit,
      configuration.flushTimeout,
      pageState
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
