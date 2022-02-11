import type { StackTrace } from './types'

const UNKNOWN_FUNCTION = '?'

/**
 * computeStackTrace: cross-browser stack traces in JavaScript
 *
 * Syntax:
 * ```js
 * s = computeStackTraceOfCaller([depth])
 * s = computeStackTrace(exception)
 * ```
 *
 * Supports:
 *   - Firefox:  full stack trace with line numbers and unreliable column
 *               number on top frame
 *   - Opera 10: full stack trace with line and column numbers
 *   - Opera 9-: full stack trace with line numbers
 *   - Chrome:   full stack trace with line and column numbers
 *   - Safari:   line and column number for the topmost stacktrace element
 *               only
 *   - IE:       no line numbers whatsoever
 *
 * Tries to guess names of anonymous functions by looking for assignments
 * in the source code. In IE and Safari, we have to guess source file names
 * by searching for function bodies inside all page scripts. This will not
 * work for scripts that are loaded cross-domain.
 * Here be dragons: some function names may be guessed incorrectly, and
 * duplicate functions may be mismatched.
 *
 * computeStackTrace should only be used for tracing purposes.
 *
 * Note: In IE and Safari, no stack trace is recorded on the Error object,
 * so computeStackTrace instead walks its *own* chain of callers.
 * This means that:
 *  * in Safari, some methods may be missing from the stack trace;
 *  * in IE, the topmost function in the stack trace will always be the
 *    caller of computeStackTrace.
 *
 * This is okay for tracing (because you are likely to be calling
 * computeStackTrace from the function you want to be the topmost element
 * of the stack trace anyway), but not okay for logging unhandled
 * exceptions (because your catch block will likely be far away from the
 * inner function that actually caused the exception).
 *
 * Tracing example:
 * ```js
 *     function trace(message) {
 *         let stackInfo = computeStackTrace.ofCaller();
 *         let data = message + "\n";
 *         for(let i in stackInfo.stack) {
 *             let item = stackInfo.stack[i];
 *             data += (item.func || '[anonymous]') + "() in " + item.url + ":" + (item.line || '0') + "\n";
 *         }
 *         if (window.console)
 *             console.info(data);
 *         else
 *             alert(data);
 *     }
 * ```
 * @memberof TraceKit
 * @namespace
 */

/**
 * Computes a stack trace for an exception.
 * @param {Error} ex
 * @param {(string|number)=} depth
 * @memberof computeStackTrace
 */
export function computeStackTrace(ex: unknown): StackTrace {
  let stack

  try {
    stack = computeStackTraceFromStackProp(ex)
    if (stack) {
      return stack
    }
  } catch (e) {
    if (debug) {
      throw e
    }
  }

  return {
    message: tryToGetString(ex, 'message'),
    name: tryToGetString(ex, 'name'),
    stack: [],
  }
}

const debug = false

// Contents of Exception in various browsers.
//
// SAFARI:
// ex.message = Can't find variable: qq
// ex.line = 59
// ex.sourceId = 580238192
// ex.sourceURL = http://...
// ex.expressionBeginOffset = 96
// ex.expressionCaretOffset = 98
// ex.expressionEndOffset = 98
// ex.name = ReferenceError
//
// FIREFOX:
// ex.message = qq is not defined
// ex.fileName = http://...
// ex.lineNumber = 59
// ex.columnNumber = 69
// ex.stack = ...stack trace... (see the example below)
// ex.name = ReferenceError
//
// CHROME:
// ex.message = qq is not defined
// ex.name = ReferenceError
// ex.type = not_defined
// ex.arguments = ['aa']
// ex.stack = ...stack trace...
//
// INTERNET EXPLORER:
// ex.message = ...
// ex.name = ReferenceError
//
// OPERA:
// ex.message = ...message... (see the example below)
// ex.name = ReferenceError
// ex.opera#sourceloc = 11  (pretty much useless, duplicates the info in ex.message)
// ex.stacktrace = n/a; see 'opera:config#UserPrefs|Exceptions Have Stacktrace'

/**
 * Computes stack trace information from the stack property.
 * Chrome and Gecko use this property.
 * @param {Error} ex
 * @return {?StackTrace} Stack trace information.
 * @memberof computeStackTrace
 */
export function computeStackTraceFromStackProp(ex: unknown) {
  const stacktrace = tryToGetString(ex, 'stack')
  if (!stacktrace) {
    return
  }

  /* eslint-disable  max-len */
  const chrome =
    /^\s*at (.*?) ?\(((?:file|https?|blob|chrome-extension|native|eval|webpack|<anonymous>|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i
  const gecko =
    /^\s*(.*?)(?:\((.*?)\))?(?:^|@)((?:file|https?|blob|chrome|webpack|resource|capacitor|\[native).*?|[^@]*bundle)(?::(\d+))?(?::(\d+))?\s*$/i
  const winjs =
    /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i
  /* eslint-enable  max-len */

  // Used to additionally parse URL/line/column from eval frames
  let isEval
  const geckoEval = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i
  const chromeEval = /\((\S*)(?::(\d+))(?::(\d+))\)/
  const lines = stacktrace.split('\n')
  const stack = []
  let submatch
  let parts
  let element

  for (let i = 0, j = lines.length; i < j; i += 1) {
    if (chrome.exec(lines[i])) {
      parts = chrome.exec(lines[i])!
      const isNative = parts[2] && parts[2].indexOf('native') === 0 // start of line
      isEval = parts[2] && parts[2].indexOf('eval') === 0 // start of line
      submatch = chromeEval.exec(parts[2])
      if (isEval && submatch) {
        // throw out eval line/column and use top-most line/column number
        parts[2] = submatch[1] // url
        parts[3] = submatch[2] // line
        parts[4] = submatch[3] // column
      }
      element = {
        args: isNative ? [parts[2]] : [],
        column: parts[4] ? +parts[4] : undefined,
        func: parts[1] || UNKNOWN_FUNCTION,
        line: parts[3] ? +parts[3] : undefined,
        url: !isNative ? parts[2] : undefined,
      }
    } else if (winjs.exec(lines[i])) {
      parts = winjs.exec(lines[i])!
      element = {
        args: [],
        column: parts[4] ? +parts[4] : undefined,
        func: parts[1] || UNKNOWN_FUNCTION,
        line: +parts[3],
        url: parts[2],
      }
    } else if (gecko.exec(lines[i])) {
      parts = gecko.exec(lines[i])!
      isEval = parts[3] && parts[3].indexOf(' > eval') > -1
      submatch = geckoEval.exec(parts[3])
      if (isEval && submatch) {
        // throw out eval line/column and use top-most line number
        parts[3] = submatch[1]
        parts[4] = submatch[2]
        parts[5] = undefined! // no column when eval
      } else if (i === 0 && !parts[5] && !isUndefined((ex as any).columnNumber)) {
        // FireFox uses this awesome columnNumber property for its top frame
        // Also note, Firefox's column number is 0-based and everything else expects 1-based,
        // so adding 1
        // NOTE: this hack doesn't work if top-most frame is eval
        stack[0].column = ((ex as any).columnNumber as number) + 1
      }
      element = {
        args: parts[2] ? parts[2].split(',') : [],
        column: parts[5] ? +parts[5] : undefined,
        func: parts[1] || UNKNOWN_FUNCTION,
        line: parts[4] ? +parts[4] : undefined,
        url: parts[3],
      }
    } else {
      continue
    }

    if (!element.func && element.line) {
      element.func = UNKNOWN_FUNCTION
    }
    stack.push(element)
  }

  if (!stack.length) {
    return
  }

  return {
    stack,
    message: tryToGetString(ex, 'message'),
    name: tryToGetString(ex, 'name'),
  }
}

function tryToGetString(candidate: unknown, property: string) {
  if (typeof candidate !== 'object' || !candidate || !(property in candidate)) {
    return undefined
  }
  const value = (candidate as { [k: string]: unknown })[property]
  return typeof value === 'string' ? value : undefined
}

/**
 * Logs a stacktrace starting from the previous call and working down.
 * @param {(number|string)=} depth How many frames deep to trace.
 * @return {StackTrace} Stack trace information.
 * @memberof computeStackTrace
 */
export function computeStackTraceOfCaller() {
  try {
    // Throw error for IE
    throw new Error()
  } catch (ex) {
    return computeStackTrace(ex)
  }
}

/**
 * Returns true if the parameter is undefined<br/>
 * Example: `isUndefined(val) === true/false`
 *
 * @param {*} what Value to check
 * @return {Boolean} true if undefined and false otherwise
 */
function isUndefined(what: any) {
  return typeof what === 'undefined'
}
