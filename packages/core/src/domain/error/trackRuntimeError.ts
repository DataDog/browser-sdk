import { instrumentMethodAndCallOriginal } from '../../tools/instrumentMethod'
import type { Observable } from '../../tools/observable'
import { clocksNow } from '../../tools/utils/timeUtils'
import type { StackTrace } from './computeStackTrace'
import { computeStackTrace } from './computeStackTrace'
import { computeRawError } from './error'
import type { RawError } from './error.types'
import { ErrorHandling, ErrorSource, NonErrorPrefix } from './error.types'

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#Error_types
const ERROR_TYPES_RE =
  /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?([\s\S]*)$/

/**
 * Cross-browser collection of unhandled errors
 *
 * Supports:
 * - Firefox: full stack trace with line numbers, plus column number
 * on top frame; column number is not guaranteed
 * - Opera: full stack trace with line and column numbers
 * - Chrome: full stack trace with line and column numbers
 * - Safari: line and column number for the top frame only; some frames
 * may be missing, and column number is not guaranteed
 * - IE: line and column number for the top frame only; some frames
 * may be missing, and column number is not guaranteed
 *
 * In theory, TraceKit should work on all of the following versions:
 * - IE5.5+ (only 8.0 tested)
 * - Firefox 0.9+ (only 3.5+ tested)
 * - Opera 7+ (only 10.50 tested; versions 9 and earlier may require
 * Exceptions Have Stacktrace to be enabled in opera:config)
 * - Safari 3+ (only 4+ tested)
 * - Chrome 1+ (only 5+ tested)
 * - Konqueror 3.5+ (untested)
 *
 * Tries to catch all unhandled errors and report them to the
 * callback.
 *
 * Callbacks receive a StackTrace object as described in the
 * computeStackTrace docs.
 *
 * @memberof TraceKit
 * @namespace
 */

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

/**
 * Install a global onerror handler
 */
export function instrumentOnError(callback: UnhandledErrorCallback) {
  return instrumentMethodAndCallOriginal(window, 'onerror', {
    before(this: any, messageObj: unknown, url?: string, line?: number, column?: number, errorObj?: unknown) {
      let stackTrace: StackTrace
      if (errorObj instanceof Error) {
        stackTrace = computeStackTrace(errorObj)
      } else {
        const stack = [{ url, column, line }]
        const { name, message } = tryToParseMessage(messageObj)
        stackTrace = {
          name,
          message,
          stack,
        }
      }
      callback(stackTrace, errorObj ?? messageObj)
    },
  })
}

function tryToParseMessage(messageObj: unknown) {
  let name
  let message
  if ({}.toString.call(messageObj) === '[object String]') {
    ;[, name, message] = ERROR_TYPES_RE.exec(messageObj as string)!
  }
  return { name, message }
}

/**
 * Install a global onunhandledrejection handler
 */
export function instrumentUnhandledRejection(callback: UnhandledErrorCallback) {
  return instrumentMethodAndCallOriginal(window, 'onunhandledrejection', {
    before(e: PromiseRejectionEvent) {
      const reason = e.reason || 'Empty reason'
      const stack = computeStackTrace(reason)
      callback(stack, reason)
    },
  })
}
