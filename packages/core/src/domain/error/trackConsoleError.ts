import {
  ErrorSource,
  toStackTraceString,
  ErrorHandling,
  createHandlingStack,
  formatErrorMessage,
  RawError,
} from '../../tools/error'
import { Observable } from '../../tools/observable'
import { clocksNow } from '../../tools/timeUtils'
import { find, jsonStringify } from '../../tools/utils'
import { callMonitored } from '../internalMonitoring'
import { computeStackTrace } from '../tracekit'

/* eslint-disable no-console */
export function trackConsoleError(errorObservable: Observable<RawError>) {
  startConsoleErrorProxy().afterCall((error) => errorObservable.notify(error))

  return {
    stop: resetConsoleErrorProxy,
  }
}

type AfterCallCallback = (error: RawError) => void

interface ConsoleErrorProxy {
  afterCall: (callback: AfterCallCallback) => void
}

let originalConsoleError: (...params: unknown[]) => void
let consoleErrorProxySingleton: ConsoleErrorProxy | undefined
const afterCallCallbacks: AfterCallCallback[] = []

function startConsoleErrorProxy() {
  if (!consoleErrorProxySingleton) {
    originalConsoleError = console.error

    console.error = (...params: unknown[]) => {
      const handlingStack = createHandlingStack()
      callMonitored(() => {
        originalConsoleError.apply(console, params)
        const rawError = {
          ...buildErrorFromParams(params, handlingStack),
          source: ErrorSource.CONSOLE,
          startClocks: clocksNow(),
          handling: ErrorHandling.HANDLED,
        }
        afterCallCallbacks.forEach((callback) => callback(rawError))
      })
    }
    consoleErrorProxySingleton = {
      afterCall(callback: AfterCallCallback) {
        afterCallCallbacks.push(callback)
      },
    }
  }
  return consoleErrorProxySingleton
}

function resetConsoleErrorProxy() {
  if (consoleErrorProxySingleton) {
    consoleErrorProxySingleton = undefined
    afterCallCallbacks.splice(0, afterCallCallbacks.length)
    console.error = originalConsoleError
  }
}

function buildErrorFromParams(params: unknown[], handlingStack: string) {
  const firstErrorParam = find(params, (param: unknown): param is Error => param instanceof Error)

  return {
    message: ['console error:', ...params].map((param) => formatConsoleParameters(param)).join(' '),
    stack: firstErrorParam ? toStackTraceString(computeStackTrace(firstErrorParam)) : undefined,
    handlingStack,
  }
}

function formatConsoleParameters(param: unknown) {
  if (typeof param === 'string') {
    return param
  }
  if (param instanceof Error) {
    return formatErrorMessage(computeStackTrace(param))
  }
  return jsonStringify(param, undefined, 2)
}
