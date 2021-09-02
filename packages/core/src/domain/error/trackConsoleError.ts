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
  startConsoleErrorProxy().subscribe((error) => errorObservable.notify(error))
}

let originalConsoleError: (...params: unknown[]) => void
let consoleErrorObservable: Observable<RawError> | undefined

function startConsoleErrorProxy() {
  if (!consoleErrorObservable) {
    consoleErrorObservable = new Observable<RawError>()
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
        consoleErrorObservable!.notify(rawError)
      })
    }
  }
  return consoleErrorObservable
}

export function resetConsoleErrorProxy() {
  if (consoleErrorObservable) {
    consoleErrorObservable = undefined
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
