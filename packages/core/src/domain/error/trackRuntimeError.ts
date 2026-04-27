import { instrumentMethod } from '../../tools/instrumentMethod'
import { Observable } from '../../tools/observable'
import { clocksNow } from '../../tools/utils/timeUtils'
import type { StackTrace } from '../../tools/stackTrace/computeStackTrace'
import { computeStackTraceFromOnErrorMessage } from '../../tools/stackTrace/computeStackTrace'
import { getGlobalObject } from '../../tools/globalObject'
import { computeRawError, isError } from './error'
import type { RawError } from './error.types'
import { ErrorHandling, ErrorSource, NonErrorPrefix } from './error.types'

export type UnhandledErrorCallback = (originalError: unknown, stackTrace?: StackTrace) => any

export function trackRuntimeError() {
  return new Observable<RawError>((observer) => {
    const handleRuntimeError = (originalError: unknown, stackTrace?: StackTrace) => {
      const rawError = computeRawError({
        stackTrace,
        originalError,
        startClocks: clocksNow(),
        nonErrorPrefix: NonErrorPrefix.UNCAUGHT,
        source: ErrorSource.SOURCE,
        handling: ErrorHandling.UNHANDLED,
      })
      observer.notify(rawError)
    }
    const { stop: stopInstrumentingOnError } = instrumentOnError(handleRuntimeError)
    const { stop: stopInstrumentingOnUnhandledRejection } = instrumentUnhandledRejection(handleRuntimeError)

    return () => {
      stopInstrumentingOnError()
      stopInstrumentingOnUnhandledRejection()
    }
  })
}

export function instrumentOnError(callback: UnhandledErrorCallback) {
  return instrumentMethod(getGlobalObject(), 'onerror', ({ parameters: [messageObj, url, line, column, errorObj] }) => {
    let stackTrace
    if (!isError(errorObj)) {
      stackTrace = computeStackTraceFromOnErrorMessage(messageObj, url, line, column)
    }
    callback(errorObj ?? messageObj, stackTrace)
  })
}

export function instrumentUnhandledRejection(callback: UnhandledErrorCallback) {
  return instrumentMethod(getGlobalObject(), 'onunhandledrejection', ({ parameters: [e] }) => {
    callback(e.reason || 'Empty reason')
  })
}
