import { Batch, Context, HttpRequest, EndpointBuilder } from '@datadog/browser-core'
import { LogsConfiguration } from '../domain/configuration'

export function startLoggerBatch(configuration: LogsConfiguration) {
  const primaryBatch = createLoggerBatch(configuration.logsEndpointBuilder)

  let replicaBatch: Batch | undefined
  if (configuration.replica !== undefined) {
    replicaBatch = createLoggerBatch(configuration.replica.logsEndpointBuilder)
  }

  function createLoggerBatch(endpointBuilder: EndpointBuilder) {
    return new Batch(
      new HttpRequest(endpointBuilder, configuration.batchBytesLimit),
      configuration.maxBatchSize,
      configuration.batchBytesLimit,
      configuration.maxMessageSize,
      configuration.flushTimeout
    )
  }

  return {
    add(message: Context) {
      primaryBatch.add(message)
      if (replicaBatch) {
        replicaBatch.add(message)
      }
    },
  }
}
