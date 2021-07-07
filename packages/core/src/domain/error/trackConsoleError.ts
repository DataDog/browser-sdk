import {
  ErrorSource,
  toStackTraceString,
  ErrorHandling,
  createHandlingStack,
  formatErrorMessage,
} from '../../tools/error'
import { clocksNow } from '../../tools/timeUtils'
import { find, jsonStringify } from '../../tools/utils'
import { callMonitored } from '../internalMonitoring'
import { computeStackTrace } from '../tracekit'
import { ErrorObservable } from '../../tools/observable'

let originalConsoleError: (...params: unknown[]) => void

/* eslint-disable no-console */
export function trackConsoleError(errorObservable: ErrorObservable) {
  originalConsoleError = console.error

  console.error = (...params: unknown[]) => {
    const handlingStack = createHandlingStack()
    callMonitored(() => {
      originalConsoleError.apply(console, params)
      errorObservable.notify({
        ...buildErrorFromParams(params, handlingStack),
        source: ErrorSource.CONSOLE,
        startClocks: clocksNow(),
        handling: ErrorHandling.HANDLED,
      })
    })
  }

  return {
    stop: () => {
      console.error = originalConsoleError
    },
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
