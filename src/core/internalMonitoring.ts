import { StatusType } from '../logs/logger'
import { computeStackTrace } from '../tracekit/tracekit'
import { Configuration } from './configuration'
import { getCommonContext } from './context'
import { formatStackTraceToContext } from './errorCollection'
import { Batch, HttpRequest } from './transport'
import * as utils from './utils'

interface MonitoringMessage {
  entryType: 'internal'
  message: string
  status: StatusType.error
}

const monitoringConfiguration: {
  batch?: Batch<MonitoringMessage>
  debugMode?: boolean
  maxMessagesPerPage: number
  sentMessageCount: number
} = { maxMessagesPerPage: 0, sentMessageCount: 0 }

export function startInternalMonitoring(configuration: Configuration) {
  if (!configuration.internalMonitoringEndpoint) {
    return
  }

  const batch = new Batch<MonitoringMessage>(
    new HttpRequest(configuration.internalMonitoringEndpoint, configuration.batchBytesLimit),
    configuration.maxBatchSize,
    configuration.batchBytesLimit,
    configuration.maxMessageSize,
    configuration.flushTimeout,
    () => ({
      ...getCommonContext(),
    }),
    utils.withSnakeCaseKeys
  )

  Object.assign(monitoringConfiguration, {
    batch,
    maxMessagesPerPage: configuration.maxInternalMonitoringMessagesPerPage,
    sentMessageCount: 0,
  })
}

export function resetInternalMonitoring() {
  monitoringConfiguration.batch = undefined
}

export function monitored(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value
  descriptor.value = function() {
    const decorated = monitoringConfiguration.batch ? monitor(originalMethod) : originalMethod
    return decorated.apply(this, arguments)
  }
}

// tslint:disable-next-line ban-types
export function monitor<T extends Function>(fn: T): T {
  return (function(this: any) {
    try {
      return fn.apply(this, arguments)
    } catch (e) {
      logErrorIfDebug(e)
      try {
        if (
          monitoringConfiguration.batch &&
          monitoringConfiguration.sentMessageCount < monitoringConfiguration.maxMessagesPerPage
        ) {
          monitoringConfiguration.sentMessageCount += 1
          const stackTrace = computeStackTrace(e)
          monitoringConfiguration.batch.add({
            entryType: 'internal',
            message: stackTrace.message,
            status: StatusType.error,
            ...formatStackTraceToContext(stackTrace),
          })
        }
      } catch (e) {
        logErrorIfDebug(e)
      }
    }
  } as unknown) as T // consider output type has input type
}

export function setDebugMode(debugMode: boolean) {
  monitoringConfiguration.debugMode = debugMode
}

function logErrorIfDebug(e: any) {
  if (monitoringConfiguration.debugMode) {
    // Log as warn to not forward the logs.
    console.warn('[INTERNAL ERROR]', e)
  }
}
