// tslint:disable ban-types

import lodashAssign from 'lodash.assign'

import { computeStackTrace } from '../tracekit/tracekit'
import { Configuration } from './configuration'
import { toStackTraceString } from './errorCollection'
import { StatusType } from './status'
import { Batch, HttpRequest } from './transport'
import * as utils from './utils'

export interface MonitoringMessage {
  entryType: 'internal'
  message: string
  status: StatusType
  error?: {
    kind?: string
    stack: string
  }
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
      date: new Date().getTime(),
      screen: {
        url: window.location.href,
      },
    }),
    utils.withSnakeCaseKeys
  )

  lodashAssign(monitoringConfiguration, {
    batch,
    maxMessagesPerPage: configuration.maxInternalMonitoringMessagesPerPage,
    sentMessageCount: 0,
  })
}

export function resetInternalMonitoring() {
  monitoringConfiguration.batch = undefined
}

export function monitored(_: any, __: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value
  descriptor.value = function() {
    const decorated = (monitoringConfiguration.batch ? monitor(originalMethod) : originalMethod) as Function
    return decorated.apply(this, arguments)
  }
}

export function monitor<T extends Function>(fn: T): T {
  return (function(this: any) {
    try {
      return fn.apply(this, arguments)
    } catch (e) {
      logErrorIfDebug(e)
      try {
        addErrorToMonitoringBatch(e)
      } catch (e) {
        logErrorIfDebug(e)
      }
    }
  } as unknown) as T // consider output type has input type
}

export function addMonitoringMessage(message: string) {
  addToMonitoringBatch({
    message,
    entryType: 'internal',
    status: StatusType.info,
  })
}

function addErrorToMonitoringBatch(e: unknown) {
  addToMonitoringBatch({
    ...formatError(e),
    entryType: 'internal',
    status: StatusType.error,
  })
}

function addToMonitoringBatch(message: MonitoringMessage) {
  if (
    monitoringConfiguration.batch &&
    monitoringConfiguration.sentMessageCount < monitoringConfiguration.maxMessagesPerPage
  ) {
    monitoringConfiguration.sentMessageCount += 1

    monitoringConfiguration.batch.add(message)
  }
}

function formatError(e: unknown) {
  if (e instanceof Error) {
    const stackTrace = computeStackTrace(e)
    return {
      error: {
        kind: stackTrace.name,
        stack: toStackTraceString(stackTrace),
      },
      message: stackTrace.message,
    }
  }
  return {
    error: {
      stack: 'Not an instance of error',
    },
    message: `Uncaught ${utils.jsonStringify(e)}`,
  }
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
