import type { Context, EndpointBuilder } from '@datadog/browser-core'
import { Batch, HttpRequest } from '@datadog/browser-core'
import type { LogsConfiguration } from '../domain/configuration'

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
