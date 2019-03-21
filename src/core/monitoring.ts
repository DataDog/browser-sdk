import { computeStackTrace } from '../tracekit/tracekit'
import { Configuration } from './configuration'
import { getCommonContext } from './context'
import { LogLevelEnum } from './logger'
import { Batch, HttpRequest } from './transport'

let monitoringConfiguration:
  | {
      batch: Batch
      maxMessagesPerPage: number
      sentMessageCount: number
    }
  | undefined

export function startMonitoring(configuration: Configuration) {
  if (!configuration.monitoringEndpoint) {
    return
  }

  const batch = new Batch(
    new HttpRequest(configuration.monitoringEndpoint, configuration.batchBytesLimit),
    configuration.maxBatchSize,
    configuration.batchBytesLimit,
    configuration.maxMessageSize,
    configuration.flushTimeout,
    () => ({
      ...getCommonContext(),
    })
  )

  monitoringConfiguration = {
    batch,
    maxMessagesPerPage: configuration.maxMonitoringMessagesPerPage,
    sentMessageCount: 0,
  }
}

export function resetMonitoring() {
  monitoringConfiguration = undefined
}

export function monitored(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value
  descriptor.value = function() {
    const decorated = monitoringConfiguration ? monitor(originalMethod) : originalMethod
    return decorated.apply(this, arguments)
  }
}

// tslint:disable-next-line ban-types
export function monitor<T extends Function>(fn: T): T {
  return (function(this: any) {
    try {
      return fn.apply(this, arguments)
    } catch (e) {
      try {
        if (
          monitoringConfiguration &&
          monitoringConfiguration.sentMessageCount < monitoringConfiguration.maxMessagesPerPage
        ) {
          monitoringConfiguration.sentMessageCount += 1
          monitoringConfiguration.batch.add({
            ...computeStackTrace(e),
            entryType: 'internal',
            severity: LogLevelEnum.error,
          })
        }
      } catch {
        // nothing to do
      }
    }
  } as unknown) as T // consider output type has input type
}
