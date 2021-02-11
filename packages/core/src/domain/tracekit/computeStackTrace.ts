import { StackFrame, StackTrace } from './types'
import { report } from './report'

const UNKNOWN_FUNCTION = '?'

/**
 * computeStackTrace: cross-browser stack traces in JavaScript
 *
 * Syntax:
 * ```js
 * s = computeStackTraceOfCaller([depth])
 * s = computeStackTrace(exception) // consider using report instead (see below)
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
 * Logging of unhandled exceptions should be done with report,
 * which builds on top of computeStackTrace and provides better
 * IE support by utilizing the window.onerror event to retrieve information
 * about the top of the stack.
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
export function computeStackTrace(ex: unknown, depth?: string | number): StackTrace {
  let stack
  const normalizedDepth = depth === undefined ? 0 : +depth

  try {
    // This must be tried first because Opera 10 *destroys*
    // its stacktrace property if you try to access the stack
    // property first!!
    stack = computeStackTraceFromStacktraceProp(ex)
    if (stack) {
      return stack
    }
  } catch (e) {
    if (debug) {
      throw e
    }
  }

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

  try {
    stack = computeStackTraceFromOperaMultiLineMessage(ex)
    if (stack) {
      return stack
    }
  } catch (e) {
    if (debug) {
      throw e
    }
  }

  try {
    stack = computeStackTraceByWalkingCallerChain(ex, normalizedDepth + 1)
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

  // eslint-disable-next-line  max-len
  const chrome = /^\s*at (.*?) ?\(((?:file|https?|blob|chrome-extension|native|eval|webpack|<anonymous>|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i
  // eslint-disable-next-line  max-len
  const gecko = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)((?:file|https?|blob|chrome|webpack|resource|capacitor|\[native).*?|[^@]*bundle)(?::(\d+))?(?::(\d+))?\s*$/i
  // eslint-disable-next-line  max-len
  const winjs = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i

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

/**
 * Computes stack trace information from the stacktrace property.
 * Opera 10+ uses this property.
 * @param {Error} ex
 * @return {?StackTrace} Stack trace information.
 * @memberof computeStackTrace
 */
function computeStackTraceFromStacktraceProp(ex: unknown) {
  // Access and store the stacktrace property before doing ANYTHING
  // else to it because Opera is not very good at providing it
  // reliably in other circumstances.
  const stacktrace = tryToGetString(ex, 'stacktrace')
  if (!stacktrace) {
    return
  }

  const opera10Regex = / line (\d+).*script (?:in )?(\S+)(?:: in function (\S+))?$/i
  // eslint-disable-next-line  max-len
  const opera11Regex = / line (\d+), column (\d+)\s*(?:in (?:<anonymous function: ([^>]+)>|([^\)]+))\((.*)\))? in (.*):\s*$/i
  const lines = stacktrace.split('\n')
  const stack = []
  let parts

  for (let line = 0; line < lines.length; line += 2) {
    let element: StackFrame | undefined
    if (opera10Regex.exec(lines[line])) {
      parts = opera10Regex.exec(lines[line])!
      element = {
        args: [],
        column: undefined,
        func: parts[3],
        line: +parts[1],
        url: parts[2],
      }
    } else if (opera11Regex.exec(lines[line])) {
      parts = opera11Regex.exec(lines[line])!
      element = {
        args: parts[5] ? parts[5].split(',') : [],
        column: +parts[2],
        func: parts[3] || parts[4],
        line: +parts[1],
        url: parts[6],
      }
    }

    if (element) {
      if (!element.func && element.line) {
        element.func = UNKNOWN_FUNCTION
      }
      element.context = [lines[line + 1]]

      stack.push(element)
    }
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

/**
 * NOT TESTED.
 * Computes stack trace information from an error message that includes
 * the stack trace.
 * Opera 9 and earlier use this method if the option to show stack
 * traces is turned on in opera:config.
 * @param {Error} ex
 * @return {?StackTrace} Stack information.
 * @memberof computeStackTrace
 */
function computeStackTraceFromOperaMultiLineMessage(ex: unknown): StackTrace | undefined {
  // TODO: Clean this function up
  // Opera includes a stack trace into the exception message. An example is:
  //
  // Statement on line 3: Undefined variable: undefinedFunc
  // Backtrace:
  //   Line 3 of linked script file://localhost/Users/andreyvit/Projects/TraceKit/javascript-client/sample.js:
  //   In function zzz
  //         undefinedFunc(a);
  //   Line 7 of inline#1 script in file://localhost/Users/andreyvit/Projects/TraceKit/javascript-client/sample.html:
  //   In function yyy
  //           zzz(x, y, z);
  //   Line 3 of inline#1 script in file://localhost/Users/andreyvit/Projects/TraceKit/javascript-client/sample.html:
  //   In function xxx
  //           yyy(a, a, a);
  //   Line 1 of function script
  //     try { xxx('hi'); return false; } catch(ex) { report(ex); }
  //   ...

  const message = tryToGetString(ex, 'message')
  if (!message) {
    return
  }
  const lines = message.split('\n')
  if (lines.length < 4) {
    return
  }

  const lineRE1 = /^\s*Line (\d+) of linked script ((?:file|https?|blob)\S+)(?:: in function (\S+))?\s*$/i
  const lineRE2 = /^\s*Line (\d+) of inline#(\d+) script in ((?:file|https?|blob)\S+)(?:: in function (\S+))?\s*$/i
  const lineRE3 = /^\s*Line (\d+) of function script\s*$/i
  const stack = []
  const scripts = window && window.document && window.document.getElementsByTagName('script')
  const inlineScriptBlocks = []
  let parts

  for (const s in scripts) {
    if (has(scripts, s) && !scripts[s].src) {
      inlineScriptBlocks.push(scripts[s])
    }
  }

  for (let line = 2; line < lines.length; line += 2) {
    let item: StackFrame | undefined
    if (lineRE1.exec(lines[line])) {
      parts = lineRE1.exec(lines[line])!
      item = {
        args: [],
        column: undefined,
        func: parts[3],
        line: +parts[1],
        url: parts[2],
      }
    } else if (lineRE2.exec(lines[line])) {
      parts = lineRE2.exec(lines[line])!
      item = {
        args: [],
        column: undefined, // TODO: Check to see if inline#1 (+parts[2]) points to the script number or column number.
        func: parts[4],
        line: +parts[1],
        url: parts[3],
      }
    } else if (lineRE3.exec(lines[line])) {
      parts = lineRE3.exec(lines[line])!
      const url = window.location.href.replace(/#.*$/, '')
      item = {
        url,
        args: [],
        column: undefined,
        func: '',
        line: +parts[1],
      }
    }

    if (item) {
      if (!item.func) {
        item.func = UNKNOWN_FUNCTION
      }
      item.context = [lines[line + 1]]
      stack.push(item)
    }
  }
  if (!stack.length) {
    return // could not parse multiline exception message as Opera stack trace
  }

  return {
    stack,
    message: lines[0],
    name: tryToGetString(ex, 'name'),
  }
}

/**
 * Adds information about the first frame to incomplete stack traces.
 * Safari and IE require this to get complete data on the first frame.
 * @param {StackTrace} stackInfo Stack trace information from
 * one of the compute* methods.
 * @param {string=} url The URL of the script that caused an error.
 * @param {(number|string)=} lineNo The line number of the script that
 * caused an error.
 * @param {string=} message The error generated by the browser, which
 * hopefully contains the name of the object that caused the error.
 * @return {boolean} Whether or not the stack information was
 * augmented.
 * @memberof computeStackTrace
 */
export function augmentStackTraceWithInitialElement(stackInfo: StackTrace, url?: string, lineNo?: string | number) {
  const initial: StackFrame = {
    url,
    line: lineNo ? +lineNo : undefined,
  }

  if (initial.url && initial.line) {
    stackInfo.incomplete = false

    const stack = stackInfo.stack
    if (stack.length > 0) {
      if (stack[0].url === initial.url) {
        if (stack[0].line === initial.line) {
          return false // already in stack trace
        }
        if (!stack[0].line && stack[0].func === initial.func) {
          stack[0].line = initial.line
          stack[0].context = initial.context
          return false
        }
      }
    }

    stack.unshift(initial)
    stackInfo.partial = true
    return true
  }
  stackInfo.incomplete = true

  return false
}

/**
 * Computes stack trace information by walking the arguments.caller
 * chain at the time the exception occurred. This will cause earlier
 * frames to be missed but is the only way to get any stack trace in
 * Safari and IE. The top frame is restored by
 * {@link augmentStackTraceWithInitialElement}.
 * @param {Error} ex
 * @param {number} depth
 * @return {StackTrace} Stack trace information.
 * @memberof computeStackTrace
 */
function computeStackTraceByWalkingCallerChain(ex: unknown, depth: number) {
  const functionName = /function\s+([_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*)?\s*\(/i
  const stack = []
  const funcs: any = {}
  let recursion = false
  let parts
  let item: StackFrame

  for (let curr = computeStackTraceByWalkingCallerChain.caller; curr && !recursion; curr = curr.caller) {
    if (curr === computeStackTrace || curr === report) {
      continue
    }

    item = {
      args: [],
      column: undefined,
      func: UNKNOWN_FUNCTION,
      line: undefined,
      url: undefined,
    }

    parts = functionName.exec(curr.toString())
    if ((curr as any).name) {
      item.func = (curr as any).name
    } else if (parts) {
      item.func = parts[1]
    }

    if (typeof item.func === 'undefined') {
      item.func = parts ? parts.input.substring(0, parts.input.indexOf('{')) : undefined
    }

    if (funcs[curr.toString()]) {
      recursion = true
    } else {
      funcs[curr.toString()] = true
    }

    stack.push(item)
  }

  if (depth) {
    stack.splice(0, depth)
  }

  const result: StackTrace = {
    stack,
    message: tryToGetString(ex, 'message'),
    name: tryToGetString(ex, 'name'),
  }
  augmentStackTraceWithInitialElement(
    result,
    tryToGetString(ex, 'sourceURL') || tryToGetString(ex, 'fileName'),
    tryToGetString(ex, 'line') || tryToGetString(ex, 'lineNumber')
  )
  return result
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
export function computeStackTraceOfCaller(depth?: number) {
  const currentDepth = (depth === undefined ? 0 : +depth) + 1 // "+ 1" because "ofCaller" should drop one frame
  try {
    throw new Error()
  } catch (ex) {
    return computeStackTrace(ex, currentDepth + 1)
  }
}

/**
 * A better form of hasOwnProperty<br/>
 * Example: `has(MainHostObject, property) === true/false`
 *
 * @param {Object} object to check property
 * @param {string} key to check
 * @return {Boolean} true if the object has the key and it is not inherited
 */
function has(object: object, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key)
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
