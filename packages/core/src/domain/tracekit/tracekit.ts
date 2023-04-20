import { instrumentMethodAndCallOriginal } from '../../tools/instrumentMethod'
import { computeStackTrace } from './computeStackTrace'
import type { UnhandledErrorCallback } from './types'

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#Error_types
const ERROR_TYPES_RE =
  /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?(.*)$/

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

export function startUnhandledErrorCollection(callback: UnhandledErrorCallback) {
  const { stop: stopInstrumentingOnError } = instrumentOnError(callback)
  const { stop: stopInstrumentingOnUnhandledRejection } = instrumentUnhandledRejection(callback)

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
function instrumentOnError(callback: UnhandledErrorCallback) {
  return instrumentMethodAndCallOriginal(window, 'onerror', {
    before(this: any, messageObj: unknown, url?: string, line?: number, column?: number, errorObj?: unknown) {
      if (errorObj) {
        callback(computeStackTrace(errorObj), errorObj)
        return
      }
      const stack = [{ url, column, line }]
      const { name, message } = tryToParseMessage(messageObj)
      const stackTrace = {
        name,
        message,
        stack,
      }
      callback(stackTrace, messageObj)
    },
  })
}

function tryToParseMessage(messageObj: unknown) {
  let name
  let message
  if ({}.toString.call(messageObj) === '[object String]') {
    const groups = ERROR_TYPES_RE.exec(messageObj as string)
    if (groups) {
      name = groups[1]
      message = groups[2]
    }
  }
  return { name, message }
}

/**
 * Install a global onunhandledrejection handler
 */
function instrumentUnhandledRejection(callback: UnhandledErrorCallback) {
  return instrumentMethodAndCallOriginal(window, 'onunhandledrejection', {
    before(e: PromiseRejectionEvent) {
      const reason = e.reason || 'Empty reason'
      const stack = computeStackTrace(reason)
      callback(stack, reason)
    },
  })
}
