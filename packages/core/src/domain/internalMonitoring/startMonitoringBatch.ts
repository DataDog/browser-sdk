import { Batch, HttpRequest } from '../../transport'
import type { Configuration, EndpointBuilder, MonitoringMessage } from '../..'

export function startMonitoringBatch(configuration: Configuration) {
  const primaryBatch = createMonitoringBatch(configuration.internalMonitoringEndpointBuilder!)
  let replicaBatch: Batch | undefined
  if (configuration.replica !== undefined) {
    replicaBatch = createMonitoringBatch(configuration.replica.internalMonitoringEndpointBuilder)
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
    add(message: MonitoringMessage) {
      primaryBatch.add(message)
      if (replicaBatch) {
        replicaBatch.add(message)
      }
    },
  }
}
