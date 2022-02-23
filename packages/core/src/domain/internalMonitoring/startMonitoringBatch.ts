import { Batch, HttpRequest } from '../../transport'
import type { Configuration, EndpointBuilder, Context } from '../..'

export function startMonitoringBatch<T extends Context>(
  configuration: Configuration,
  endpoint: EndpointBuilder,
  replicaEndpoint?: EndpointBuilder
) {
  const primaryBatch = createMonitoringBatch(endpoint)
  let replicaBatch: Batch | undefined
  if (replicaEndpoint) {
    replicaBatch = createMonitoringBatch(replicaEndpoint)
  }

  function createMonitoringBatch(endpointBuilder: EndpointBuilder) {
    return new Batch(
      new HttpRequest(endpointBuilder, configuration.batchBytesLimit),
      configuration.maxBatchSize,
      configuration.batchBytesLimit,
      configuration.maxMessageSize,
      configuration.flushTimeout
    )
  }

  return {
    add(message: T) {
      primaryBatch.add(message)
      if (replicaBatch) {
        replicaBatch.add(message)
      }
    },
  }
}
