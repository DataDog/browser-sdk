import { clocksNow } from '@datadog/js-core/time'
import { instrumentMethod } from '../../tools/instrumentMethod'
import { Observable } from '../../tools/observable'
import type { StackTrace } from '../../tools/stackTrace/computeStackTrace'
import { computeStackTraceFromOnErrorMessage } from '../../tools/stackTrace/computeStackTrace'
import { globalObject } from '../../tools/globalObject'
import { DOM_EVENT, isEventSupported } from '../../browser/addEventListener'
import { noop } from '../../tools/utils/functionUtils'
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
  return instrumentMethod(globalObject, 'onerror', ({ parameters: [messageObj, url, line, column, errorObj] }) => {
    let stackTrace
    if (!isError(errorObj)) {
      stackTrace = computeStackTraceFromOnErrorMessage(messageObj, url, line, column)
    }
    callback(errorObj ?? messageObj, stackTrace)
  })
}

export function instrumentUnhandledRejection(callback: UnhandledErrorCallback) {
  // Salesforce LWS does not support the unhandledrejection event. https://developer.salesforce.com/tools/lws-distortion-viewer
  if (!isEventSupported(globalObject.window, DOM_EVENT.UNHANDLED_REJECTION)) {
    return { stop: noop }
  }

  return instrumentMethod(globalObject, 'onunhandledrejection', ({ parameters: [e] }) => {
    callback(e.reason || 'Empty reason')
  })
}
