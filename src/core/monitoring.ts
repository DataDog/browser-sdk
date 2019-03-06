import { computeStackTrace } from '../tracekit/tracekit'
import { Configuration } from './configuration'
import { getCommonContext } from './context'
import { Batch, HttpRequest } from './transport'

let transport: HttpRequest | undefined
let batch: Batch | undefined

export function initMonitoring(configuration: Configuration) {
  transport = new HttpRequest(configuration.monitoringEndpoint, configuration.batchBytesLimit)
  batch = new Batch(
    transport,
    configuration.maxBatchSize,
    configuration.batchBytesLimit,
    configuration.flushTimeout,
    () => ({
      ...getCommonContext(),
    })
  )
}

export function resetMonitoring() {
  transport = undefined
  batch = undefined
}

export function monitored(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value
  descriptor.value = function() {
    const decorated = !transport ? originalMethod : monitor(originalMethod)
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
        if (batch !== undefined) {
          batch.add(computeStackTrace(e))
        }
      } catch {
        // nothing to do
      }
    }
  } as unknown) as T // consider output type has input type
}
