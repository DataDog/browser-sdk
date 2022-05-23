import type { Context } from '../../tools/context'
import { display } from '../../tools/display'
import { toStackTraceString } from '../../tools/error'
import { assign, combine, jsonStringify, performDraw, includes, startsWith } from '../../tools/utils'
import type { Configuration } from '../configuration'
import { INTAKE_SITE_STAGING, INTAKE_SITE_US1_FED } from '../configuration'
import type { StackTrace } from '../tracekit'
import { computeStackTrace } from '../tracekit'
import { Observable } from '../../tools/observable'
import { timeStampNow } from '../../tools/timeUtils'
import { ConsoleApiName } from '../console/consoleObservable'
import type { TelemetryEvent } from './telemetryEvent.types'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

const enum StatusType {
  debug = 'debug',
  error = 'error',
}

const ALLOWED_FRAME_URLS = [
  'https://www.datadoghq-browser-agent.com',
  'https://www.datad0g-browser-agent.com',
  'http://localhost',
  '<anonymous>',
]

export interface Telemetry {
  setContextProvider: (provider: () => Context) => void
  observable: Observable<TelemetryEvent & Context>
}

export interface RawTelemetryEvent extends Context {
  message: string
  status: StatusType
  error?: {
    kind?: string
    stack: string
  }
}

const TELEMETRY_EXCLUDED_SITES: string[] = [INTAKE_SITE_US1_FED]

const telemetryConfiguration: {
  debugMode?: boolean
  maxEventsPerPage: number
  sentEventCount: number
  telemetryEnabled: boolean
} = { maxEventsPerPage: 0, sentEventCount: 0, telemetryEnabled: false }

let onRawTelemetryEventCollected: ((event: RawTelemetryEvent) => void) | undefined

export function startTelemetry(configuration: Configuration): Telemetry {
  let contextProvider: () => Context
  const observable = new Observable<TelemetryEvent & Context>()

  telemetryConfiguration.telemetryEnabled = performDraw(configuration.telemetrySampleRate)

  onRawTelemetryEventCollected = (event: RawTelemetryEvent) => {
    if (!includes(TELEMETRY_EXCLUDED_SITES, configuration.site) && telemetryConfiguration.telemetryEnabled) {
      observable.notify(toTelemetryEvent(event))
    }
  }

  assign(telemetryConfiguration, {
    maxEventsPerPage: configuration.maxTelemetryEventsPerPage,
    sentEventCount: 0,
  })

  function toTelemetryEvent(event: RawTelemetryEvent): TelemetryEvent & Context {
    return combine(
      {
        type: 'telemetry' as const,
        date: timeStampNow(),
        service: 'browser-sdk',
        version: __BUILD_ENV__SDK_VERSION__,
        source: 'browser' as const,
        _dd: {
          format_version: 2 as const,
        },
        telemetry: event as any, // https://github.com/microsoft/TypeScript/issues/48457
      },
      contextProvider !== undefined ? contextProvider() : {}
    )
  }

  return {
    setContextProvider: (provider: () => Context) => {
      contextProvider = provider
    },
    observable,
  }
}

export function startFakeTelemetry() {
  const events: RawTelemetryEvent[] = []
  assign(telemetryConfiguration, {
    maxEventsPerPage: Infinity,
    sentEventCount: 0,
  })

  onRawTelemetryEventCollected = (event: RawTelemetryEvent) => {
    events.push(event)
  }

  return events
}

export function resetTelemetry() {
  onRawTelemetryEventCollected = undefined
  telemetryConfiguration.debugMode = undefined
}

/**
 * Avoid mixing telemetry events from different data centers
 * but keep replicating staging events for reliability
 */
export function isTelemetryReplicationAllowed(configuration: Configuration) {
  return configuration.site === INTAKE_SITE_STAGING
}

export function monitored<T extends (...params: any[]) => unknown>(
  _: any,
  __: string,
  descriptor: TypedPropertyDescriptor<T>
) {
  const originalMethod = descriptor.value!
  descriptor.value = function (this: any, ...args: Parameters<T>) {
    const decorated = onRawTelemetryEventCollected ? monitor(originalMethod) : originalMethod
    return decorated.apply(this, args) as ReturnType<T>
  } as T
}

export function monitor<T extends (...args: any[]) => any>(fn: T): T {
  return function (this: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return callMonitored(fn, this, arguments as unknown as Parameters<T>)
  } as unknown as T // consider output type has input type
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
    displayIfDebugEnabled(ConsoleApiName.error, e)
    try {
      addTelemetryError(e)
    } catch (e) {
      displayIfDebugEnabled(ConsoleApiName.error, e)
    }
  }
}

export function addTelemetryDebug(message: string, context?: Context) {
  displayIfDebugEnabled(ConsoleApiName.debug, message, context)
  addTelemetry(
    assign(
      {
        message,
        status: StatusType.debug,
      },
      context
    )
  )
}

export function addTelemetryError(e: unknown) {
  addTelemetry(
    assign(
      {
        status: StatusType.error,
      },
      formatError(e)
    )
  )
}

function addTelemetry(event: RawTelemetryEvent) {
  if (onRawTelemetryEventCollected && telemetryConfiguration.sentEventCount < telemetryConfiguration.maxEventsPerPage) {
    telemetryConfiguration.sentEventCount += 1
    onRawTelemetryEventCollected(event)
  }
}

function formatError(e: unknown) {
  if (e instanceof Error) {
    const stackTrace = computeStackTrace(e)
    return {
      error: {
        kind: stackTrace.name,
        stack: toStackTraceString(scrubCustomerFrames(stackTrace)),
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

export function scrubCustomerFrames(stackTrace: StackTrace) {
  stackTrace.stack = stackTrace.stack.filter(
    (frame) => !frame.url || ALLOWED_FRAME_URLS.some((allowedFrameUrl) => startsWith(frame.url!, allowedFrameUrl))
  )
  return stackTrace
}

export function setDebugMode(debugMode: boolean) {
  telemetryConfiguration.debugMode = debugMode
}

function displayIfDebugEnabled(api: ConsoleApiName, ...args: any[]) {
  if (telemetryConfiguration.debugMode) {
    display(api, '[TELEMETRY]', ...args)
  }
}
