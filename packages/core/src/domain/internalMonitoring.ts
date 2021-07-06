import { Context } from '../tools/context'
import { display } from '../tools/display'
import { toStackTraceString } from '../tools/error'
import { assign, combine, jsonStringify, Parameters, ThisParameterType } from '../tools/utils'
import { Batch, HttpRequest } from '../transport/transport'
import { Configuration } from './configuration'
import { computeStackTrace } from './tracekit'

enum StatusType {
  info = 'info',
  error = 'error',
}

export interface InternalMonitoring {
  setExternalContextProvider: (provider: () => Context) => void
}

export interface MonitoringMessage extends Context {
  message: string
  status: StatusType
  error?: {
    kind?: string
    stack: string
  }
}

const monitoringConfiguration: {
  batch?: Batch
  debugMode?: boolean
  maxMessagesPerPage: number
  sentMessageCount: number
} = { maxMessagesPerPage: 0, sentMessageCount: 0 }

let externalContextProvider: () => Context

export function startInternalMonitoring(configuration: Configuration): InternalMonitoring {
  if (configuration.internalMonitoringEndpoint) {
    const batch = startMonitoringBatch(configuration)

    assign(monitoringConfiguration, {
      batch,
      maxMessagesPerPage: configuration.maxInternalMonitoringMessagesPerPage,
      sentMessageCount: 0,
    })
  }
  return {
    setExternalContextProvider: (provider: () => Context) => {
      externalContextProvider = provider
    },
  }
}

function startMonitoringBatch(configuration: Configuration) {
  const primaryBatch = createMonitoringBatch(configuration.internalMonitoringEndpoint!)
  let replicaBatch: Batch | undefined
  if (configuration.replica !== undefined) {
    replicaBatch = createMonitoringBatch(configuration.replica.internalMonitoringEndpoint)
  }

  function createMonitoringBatch(endpointUrl: string) {
    return new Batch(
      new HttpRequest(endpointUrl, configuration.batchBytesLimit),
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
        view: {
          referrer: document.referrer,
          url: window.location.href,
        },
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

export function resetInternalMonitoring() {
  monitoringConfiguration.batch = undefined
}

export function monitored<T extends (...params: any[]) => unknown>(
  _: any,
  __: string,
  descriptor: TypedPropertyDescriptor<T>
) {
  const originalMethod = descriptor.value!
  descriptor.value = function (this: any, ...args: Parameters<T>) {
    const decorated = monitoringConfiguration.batch ? monitor(originalMethod) : originalMethod
    return decorated.apply(this, args) as ReturnType<T>
  } as T
}

export function monitor<T extends (...args: any[]) => any>(fn: T): T {
  return (function (this: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return callMonitored(fn, this, (arguments as unknown) as Parameters<T>)
  } as unknown) as T // consider output type has input type
}

export function callMonitored<T extends (...args: any[]) => any>(
  fn: T,
  context: ThisParameterType<T>,
  args: Parameters<T>
): ReturnType<T> | undefined
export function callMonitored<T extends (this: void) => any>(fn: T): ReturnType<T> | undefined
export function callMonitored<T extends (...args: any[]) => any>(
  fn: T,
  context?: any,
  args?: any
): ReturnType<T> | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return fn.apply(context, args)
  } catch (e) {
    logErrorIfDebug(e)
    try {
      addErrorToMonitoringBatch(e)
    } catch (e) {
      logErrorIfDebug(e)
    }
  }
}

export function addMonitoringMessage(message: string, context?: Context) {
  logMessageIfDebug(message)
  addToMonitoringBatch({
    message,
    ...context,
    status: StatusType.info,
  })
}

export function addErrorToMonitoringBatch(e: unknown) {
  addToMonitoringBatch({
    ...formatError(e),
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
      message: stackTrace.message!,
    }
  }
  return {
    error: {
      stack: 'Not an instance of error',
    },
    message: `Uncaught ${jsonStringify(e)!}`,
  }
}

export function setDebugMode(debugMode: boolean) {
  monitoringConfiguration.debugMode = debugMode
}

function logErrorIfDebug(e: any) {
  if (monitoringConfiguration.debugMode) {
    display.error('[INTERNAL ERROR]', e)
  }
}

function logMessageIfDebug(message: any) {
  if (monitoringConfiguration.debugMode) {
    display.log('[MONITORING MESSAGE]', message)
  }
}
