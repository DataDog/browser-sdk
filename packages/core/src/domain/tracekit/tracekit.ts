import { NonErrorPrefix } from '../../tools/error.types'
import { instrumentMethodAndCallOriginal } from '../../tools/instrumentMethod'
import { jsonStringify } from '../../tools/utils'
import { computeStackTrace } from './computeStackTrace'
import type { UnhandledErrorCallback, StackTrace } from './types'

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
    before(this: any, message: Event | string, url?: string, lineNo?: number, columnNo?: number, errorObj?: unknown) {
      // Priority is given to errorObj if it is an instance of Error. This allows us to compute the most comprehensive stack trace.
      if (errorObj instanceof Error) {
        const stack = computeStackTrace(errorObj)
        callback(stack, errorObj)
      } else {
        let name: string | undefined
        let msg: string | undefined

        // Try to extract information about the error from the provided message
        if ({}.toString.call(message) === '[object String]') {
          msg = message as string
          const groups = ERROR_TYPES_RE.exec(message as string)
          if (groups) {
            name = groups[1]
            msg = groups[2]
          }
        }

        // If an errorObj is provided, give priority to its content to populate the message of the stack trace
        if (errorObj) {
          msg = jsonStringify(errorObj)
        }

        const stack: StackTrace = {
          name,
          // We only include the `Uncaught` prefix when errorObj is present, to preserve backward compatibility
          message: errorObj && msg ? `${NonErrorPrefix.UNCAUGHT} ${msg}` : msg,
          stack: [
            {
              url,
              column: columnNo,
              line: lineNo,
            },
          ],
        }
        // If provided, give priority to errorObj over message as original error
        callback(stack, errorObj || message)
      }
    },
  })
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
