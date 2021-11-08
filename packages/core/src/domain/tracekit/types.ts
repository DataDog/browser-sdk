export interface BrowserError extends Error {
  sourceURL?: string
  fileName?: string
  line?: string | number
  lineNumber?: string | number
  description?: string
}

export type UnhandledErrorCallback = (stack: StackTrace, errorObject?: any) => any

/**
 * An object representing a single stack frame.
 * @typedef {Object} StackFrame
 * @property {string=} url The JavaScript or HTML file URL.
 * @property {string=} func The function name, or empty for anonymous functions (if guessing did not work).
 * @property {string[]=} args The arguments passed to the function, if known.
 * @property {number=} line The line number, if known.
 * @property {number=} column The column number, if known.
 * @property {string[]=} context An array of source code lines; the middle element corresponds to the correct line#.
 * @memberof TraceKit
 */
export interface StackFrame {
  url?: string
  func?: string
  args?: string[]
  line?: number
  column?: number
  context?: string[]
}

/**
 * An object representing a JavaScript stack trace.
 * @typedef {Object} StackTrace
 * @property {string=} name The name of the thrown exception.
 * @property {string} message The exception error message.
 * @property {StackFrame[]} stack An array of stack frames.
 * -- method used to collect the stack trace.
 * @memberof TraceKit
 */
export interface StackTrace {
  name?: string
  message?: string
  url?: string
  stack: StackFrame[]
  incomplete?: boolean
  partial?: boolean
}
