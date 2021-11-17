import { Context } from '../tools/context'
import { display } from '../tools/display'
import { toStackTraceString } from '../tools/error'
import { assign, jsonStringify, Parameters, ThisParameterType } from '../tools/utils'
import { canUseEventBridge, getEventBridge } from '../transport'
import { Configuration } from './configuration'
import { computeStackTrace } from './tracekit'
import { startMonitoringBatch } from './internalMonitoring/startMonitoringBatch'

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
  debugMode?: boolean
  maxMessagesPerPage: number
  sentMessageCount: number
} = { maxMessagesPerPage: 0, sentMessageCount: 0 }

export let externalContextProvider: () => Context

let onInternalMonitoringEventCollected: ((message: MonitoringMessage) => void) | undefined

export function startInternalMonitoring(configuration: Configuration): InternalMonitoring {
  if (canUseEventBridge()) {
    const bridge = getEventBridge()!
    onInternalMonitoringEventCollected = (message: MonitoringMessage) => bridge.send('internalMonitoring', message)
  } else if (configuration.internalMonitoringEndpointBuilder) {
    const batch = startMonitoringBatch(configuration)
    onInternalMonitoringEventCollected = (message: MonitoringMessage) => batch.add(message)
  }

  assign(monitoringConfiguration, {
    maxMessagesPerPage: configuration.maxInternalMonitoringMessagesPerPage,
    sentMessageCount: 0,
  })

  return {
    setExternalContextProvider: (provider: () => Context) => {
      externalContextProvider = provider
    },
  }
}

export function startFakeInternalMonitoring() {
  const messages: MonitoringMessage[] = []
  assign(monitoringConfiguration, {
    maxMessagesPerPage: Infinity,
    sentMessageCount: 0,
  })

  onInternalMonitoringEventCollected = (message: MonitoringMessage) => {
    messages.push(message)
  }

  return messages
}

export function resetInternalMonitoring() {
  onInternalMonitoringEventCollected = undefined
}

export function monitored<T extends (...params: any[]) => unknown>(
  _: any,
  __: string,
  descriptor: TypedPropertyDescriptor<T>
) {
  const originalMethod = descriptor.value!
  descriptor.value = function (this: any, ...args: Parameters<T>) {
    const decorated = onInternalMonitoringEventCollected ? monitor(originalMethod) : originalMethod
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
      addErrorToMonitoring(e)
    } catch (e) {
      logErrorIfDebug(e)
    }
  }
}

export function addMonitoringMessage(message: string, context?: Context) {
  logMessageIfDebug(message, context)
  addToMonitoring({
    message,
    ...context,
    status: StatusType.info,
  })
}

export function addErrorToMonitoring(e: unknown) {
  addToMonitoring({
    ...formatError(e),
    status: StatusType.error,
  })
}

function addToMonitoring(message: MonitoringMessage) {
  if (
    onInternalMonitoringEventCollected &&
    monitoringConfiguration.sentMessageCount < monitoringConfiguration.maxMessagesPerPage
  ) {
    monitoringConfiguration.sentMessageCount += 1
    onInternalMonitoringEventCollected(message)
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

function logMessageIfDebug(message: any, context?: Context) {
  if (monitoringConfiguration.debugMode) {
    display.log('[MONITORING MESSAGE]', message, context)
  }
}
