/**
 * Cross-browser stack trace computation.
 *
 * Reference implementation: https://github.com/csnover/TraceKit/blob/04530298073c3823de72deb0b97e7b38ca7bcb59/tracekit.js
 */

export interface StackFrame {
  url?: string
  func?: string
  /** The arguments passed to the function, if known. */
  args?: string[]
  line?: number
  column?: number
  /** An array of source code lines; the middle element corresponds to the correct line. */
  context?: string[]
}

export interface StackTrace {
  name?: string
  message?: string
  url?: string
  stack: StackFrame[]
  incomplete?: boolean
  partial?: boolean
}

const UNKNOWN_FUNCTION = '?'

export function computeStackTrace(ex: unknown): StackTrace {
  const stack: StackFrame[] = []

  let stackProperty = tryToGetString(ex, 'stack')
  const exString = String(ex)
  if (stackProperty && stackProperty.startsWith(exString)) {
    stackProperty = stackProperty.slice(exString.length)
  }
  if (stackProperty) {
    stackProperty.split('\n').forEach((line) => {
      const stackFrame =
        parseChromeLine(line) || parseChromeAnonymousLine(line) || parseWinLine(line) || parseGeckoLine(line)
      if (stackFrame) {
        if (!stackFrame.func && stackFrame.line) {
          stackFrame.func = UNKNOWN_FUNCTION
        }

        stack.push(stackFrame)
      }
    })
  }

  if (stack.length > 0 && WRONGLY_REPORTING_CUSTOM_ERRORS) { // if we are wrongly reporting custom errors
    if (ex instanceof Error && isErrorCustomError(ex)) { // if the element is a custom error
      const firstStackFrame = stack[0];
      const errorConstructorName = Object.getPrototypeOf(ex)?.constructor?.name;
      if (firstStackFrame?.func === errorConstructorName) { // if the first stack frame is the custom error constructor
        stack.shift(); // remove it
      }
    }
  }

  return {
    message: tryToGetString(ex, 'message'),
    name: tryToGetString(ex, 'name'),
    stack,
  }
}
const fileUrl =
  '((?:file|https?|blob|chrome-extension|electron|native|eval|webpack|snippet|<anonymous>|\\w+\\.|\\/).*?)'
const filePosition = '(?::(\\d+))'
const CHROME_LINE_RE = new RegExp(`^\\s*at (.*?) ?\\(${fileUrl}${filePosition}?${filePosition}?\\)?\\s*$`, 'i')

const CHROME_EVAL_RE = new RegExp(`\\((\\S*)${filePosition}${filePosition}\\)`)

function parseChromeLine(line: string): StackFrame | undefined {
  const parts = CHROME_LINE_RE.exec(line)

  if (!parts) {
    return
  }

  const isNative = parts[2] && parts[2].indexOf('native') === 0 // start of line
  const isEval = parts[2] && parts[2].indexOf('eval') === 0 // start of line
  const submatch = CHROME_EVAL_RE.exec(parts[2])

  if (isEval && submatch) {
    // throw out eval line/column and use top-most line/column number
    parts[2] = submatch[1] // url
    parts[3] = submatch[2] // line
    parts[4] = submatch[3] // column
  }

  return {
    args: isNative ? [parts[2]] : [],
    column: parts[4] ? +parts[4] : undefined,
    func: parts[1] || UNKNOWN_FUNCTION,
    line: parts[3] ? +parts[3] : undefined,
    url: !isNative ? parts[2] : undefined,
  }
}

const CHROME_ANONYMOUS_FUNCTION_RE = new RegExp(`^\\s*at ?${fileUrl}${filePosition}?${filePosition}??\\s*$`, 'i')

function parseChromeAnonymousLine(line: string): StackFrame | undefined {
  const parts = CHROME_ANONYMOUS_FUNCTION_RE.exec(line)

  if (!parts) {
    return
  }

  return {
    args: [],
    column: parts[3] ? +parts[3] : undefined,
    func: UNKNOWN_FUNCTION,
    line: parts[2] ? +parts[2] : undefined,
    url: parts[1],
  }
}

const WINJS_LINE_RE =
  /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i

function parseWinLine(line: string): StackFrame | undefined {
  const parts = WINJS_LINE_RE.exec(line)
  if (!parts) {
    return
  }

  return {
    args: [],
    column: parts[4] ? +parts[4] : undefined,
    func: parts[1] || UNKNOWN_FUNCTION,
    line: +parts[3],
    url: parts[2],
  }
}

const GECKO_LINE_RE =
  /^\s*(.*?)(?:\((.*?)\))?(?:^|@)((?:file|https?|blob|chrome|webpack|resource|capacitor|\[native).*?|[^@]*bundle|\[wasm code\])(?::(\d+))?(?::(\d+))?\s*$/i
const GECKO_EVAL_RE = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i

function parseGeckoLine(line: string): StackFrame | undefined {
  const parts = GECKO_LINE_RE.exec(line)
  if (!parts) {
    return
  }

  const isEval = parts[3] && parts[3].indexOf(' > eval') > -1
  const submatch = GECKO_EVAL_RE.exec(parts[3])

  if (isEval && submatch) {
    // throw out eval line/column and use top-most line number
    parts[3] = submatch[1]
    parts[4] = submatch[2]
    parts[5] = undefined! // no column when eval
  }

  return {
    args: parts[2] ? parts[2].split(',') : [],
    column: parts[5] ? +parts[5] : undefined,
    func: parts[1] || UNKNOWN_FUNCTION,
    line: parts[4] ? +parts[4] : undefined,
    url: parts[3],
  }
}

function tryToGetString(candidate: unknown, property: string) {
  if (typeof candidate !== 'object' || !candidate || !(property in candidate)) {
    return undefined
  }
  const value = (candidate as { [k: string]: unknown })[property]
  return typeof value === 'string' ? value : undefined
}

export function computeStackTraceFromOnErrorMessage(
  messageObj: unknown,
  url?: string,
  line?: number,
  column?: number
): StackTrace | undefined {
  if (url === undefined) {
    return
  }
  const { name, message } = tryToParseMessage(messageObj)
  return {
    name,
    message,
    stack: [{ url, column, line }],
  }
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#Error_types
const ERROR_TYPES_RE =
  /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?([\s\S]*)$/

function tryToParseMessage(messageObj: unknown) {
  let name
  let message
  if ({}.toString.call(messageObj) === '[object String]') {
    ;[, name, message] = ERROR_TYPES_RE.exec(messageObj as string)!
  }
  return { name, message }
}

// Custom error stacktrace fix 
// Some browsers (safari/firefox) add the error constructor as a frame in the stacktrace
// In order to normalize the stacktrace, we need to remove it

function isErrorCustomError(error: Error) {
  let errorProto = Object.getPrototypeOf(error);
  return errorProto?.constructor?.toString().startsWith('class ');
}

function isWronglyReportingCustomErrors() {
  // Should not be minified during compilation.
  class _DatadogTestCustomError extends Error {
      constructor() {
          super();
          this.name = 'TestError';// different name than the constructor name
      }
  }

  let customError = new _DatadogTestCustomError();
  let customErrorStack = customError.stack?.toString() ?? "";

  // If the stack trace includes the custom error class name, it means that the constructor is added to the stacktrace
  return customErrorStack.includes('_DatadogTestCustomError');
}

let WRONGLY_REPORTING_CUSTOM_ERRORS = isWronglyReportingCustomErrors();

export function _setWRONGLY_REPORTING_CUSTOM_ERRORS(value: boolean) {
  WRONGLY_REPORTING_CUSTOM_ERRORS = value;
}