import { instrumentMethodAndCallOriginal } from '../../tools/instrumentMethod'
import type { Observable } from '../../tools/observable'
import { clocksNow } from '../../tools/utils/timeUtils'
import type { StackTrace } from './computeStackTrace'
import { computeStackTrace, computeStackTraceFromOnErrorMessage } from './computeStackTrace'
import { computeRawError } from './error'
import type { RawError } from './error.types'
import { ErrorHandling, ErrorSource, NonErrorPrefix } from './error.types'

export type UnhandledErrorCallback = (stackTrace: StackTrace, originalError?: any) => any

export function trackRuntimeError(errorObservable: Observable<RawError>) {
  const handleRuntimeError = (stackTrace: StackTrace, originalError?: any) => {
    const test = computeRawError({
      stackTrace,
      originalError,
      startClocks: clocksNow(),
      nonErrorPrefix: NonErrorPrefix.UNCAUGHT,
      source: ErrorSource.SOURCE,
      handling: ErrorHandling.UNHANDLED,
    })
    errorObservable.notify(test)
  }
  const { stop: stopInstrumentingOnError } = instrumentOnError(handleRuntimeError)
  const { stop: stopInstrumentingOnUnhandledRejection } = instrumentUnhandledRejection(handleRuntimeError)

  return {
    stop: () => {
      stopInstrumentingOnError()
      stopInstrumentingOnUnhandledRejection()
    },
  }
}

export function instrumentOnError(callback: UnhandledErrorCallback) {
  return instrumentMethodAndCallOriginal(
    window,
    'onerror',
    ({ parameters: [messageObj, url, line, column, errorObj] }) => {
      let stackTrace
      if (errorObj instanceof Error) {
        stackTrace = computeStackTrace(errorObj)
      } else {
        stackTrace = computeStackTraceFromOnErrorMessage(messageObj, url, line, column)
      }
      callback(stackTrace, errorObj ?? messageObj)
    }
  )
}

export function instrumentUnhandledRejection(callback: UnhandledErrorCallback) {
  return instrumentMethodAndCallOriginal(window, 'onunhandledrejection', ({ parameters: [e] }) => {
    const reason = e.reason || 'Empty reason'
    const stack = computeStackTrace(reason)
    callback(stack, reason)
  })
}
