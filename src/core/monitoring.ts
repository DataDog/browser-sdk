import { computeStackTrace } from '../tracekit/tracekit'
import { Configuration } from './configuration'
import { getCommonContext } from './context'
import { LogLevelEnum } from './logger'
import { Batch, HttpRequest } from './transport'

let batch: Batch | undefined

export function startMonitoring(configuration: Configuration) {
  if (!configuration.monitoringEndpoint) {
    return
  }

  batch = new Batch(
    new HttpRequest(configuration.monitoringEndpoint, configuration.batchBytesLimit),
    configuration.maxBatchSize,
    configuration.batchBytesLimit,
    configuration.maxMessageSize,
    configuration.flushTimeout,
    () => ({
      ...getCommonContext(),
    })
  )
}

export function resetMonitoring() {
  batch = undefined
}

export function monitored(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value
  descriptor.value = function() {
    const decorated = batch ? monitor(originalMethod) : originalMethod
    return decorated.apply(this, arguments)
  }
}

// A bit ugly, but allows to test the limit mechanism.
let sentMessageCount = 0
const MAX_MESSAGES_PER_PAGE = 15
const INCREASE_MESSAGE_COUNT = () => {
  if (sentMessageCount < MAX_MESSAGES_PER_PAGE) {
    sentMessageCount += 1
    return true
  }

  return false
}

// tslint:disable-next-line ban-types
export function monitor<T extends Function>(fn: T, increaseMessageCount = INCREASE_MESSAGE_COUNT): T {
  return (function(this: any) {
    try {
      return fn.apply(this, arguments)
    } catch (e) {
      try {
        if (batch !== undefined && increaseMessageCount()) {
          batch.add({
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
