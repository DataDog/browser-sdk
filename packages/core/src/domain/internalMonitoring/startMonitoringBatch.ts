import { Batch, HttpRequest } from '../../transport'
import { combine, Configuration, EndpointBuilder, MonitoringMessage } from '../..'
import { externalContextProvider } from '../internalMonitoring'

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

  function withContext(message: MonitoringMessage) {
    return combine(
      {
        date: new Date().getTime(),
      },
      externalContextProvider !== undefined ? externalContextProvider() : {},
      message
    )
  }

  return {
    add(message: MonitoringMessage) {
      const contextualizedMessage = withContext(message)
      primaryBatch.add(contextualizedMessage)
      if (replicaBatch) {
        replicaBatch.add(contextualizedMessage)
      }
    },
  }
}
