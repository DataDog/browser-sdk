import { callMonitored } from '../domain/telemetry'
import type { StackTrace } from '../domain/tracekit'
import { computeStackTrace } from '../domain/tracekit'
import type { ClocksState } from './timeUtils'
import { jsonStringify, noop } from './utils'

export interface RawError {
  startClocks: ClocksState
  message: string
  type?: string
  stack?: string
  source: ErrorSource
  originalError?: unknown
  handling?: ErrorHandling
  handlingStack?: string
}

export const ErrorSource = {
  AGENT: 'agent',
  CONSOLE: 'console',
  CUSTOM: 'custom',
  LOGGER: 'logger',
  NETWORK: 'network',
  SOURCE: 'source',
  REPORT: 'report',
} as const

export const enum ErrorHandling {
  HANDLED = 'handled',
  UNHANDLED = 'unhandled',
}

// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ErrorSource = typeof ErrorSource[keyof typeof ErrorSource]

export function formatUnknownError(
  stackTrace: StackTrace | undefined,
  errorObject: any,
  nonErrorPrefix: string,
  handlingStack?: string
) {
  if (!stackTrace || (stackTrace.message === undefined && !(errorObject instanceof Error))) {
    return {
      message: `${nonErrorPrefix} ${jsonStringify(errorObject)!}`,
      stack: 'No stack, consider using an instance of Error',
      handlingStack,
      type: stackTrace && stackTrace.name,
    }
  }

  return {
    message: stackTrace.message || 'Empty message',
    stack: toStackTraceString(stackTrace),
    handlingStack,
    type: stackTrace.name,
  }
}

export function toStackTraceString(stack: StackTrace) {
  let result = formatErrorMessage(stack)
  stack.stack.forEach((frame) => {
    const func = frame.func === '?' ? '<anonymous>' : frame.func
    const args = frame.args && frame.args.length > 0 ? `(${frame.args.join(', ')})` : ''
    const line = frame.line ? `:${frame.line}` : ''
    const column = frame.line && frame.column ? `:${frame.column}` : ''
    result += `\n  at ${func!}${args} @ ${frame.url!}${line}${column}`
  })
  return result
}

export function getFileFromStackTraceString(stack: string) {
  return /@ (.+)/.exec(stack)?.[1]
}

export function formatErrorMessage(stack: StackTrace) {
  return `${stack.name || 'Error'}: ${stack.message!}`
}

/**
 Creates a stacktrace without SDK internal frames.
 
 Constraints:
 - Has to be called at the utmost position of the call stack.
 - No monitored function should encapsulate it, that is why we need to use callMonitored inside it.
 */
export function createHandlingStack(): string {
  /**
   * Skip the two internal frames:
   * - SDK API (console.error, ...)
   * - this function
   * in order to keep only the user calls
   */
  const internalFramesToSkip = 2
  const error = new Error()
  let formattedStack: string

  // IE needs to throw the error to fill in the stack trace
  if (!error.stack) {
    try {
      throw error
    } catch (e) {
      noop()
    }
  }

  callMonitored(() => {
    const stackTrace = computeStackTrace(error)
    stackTrace.stack = stackTrace.stack.slice(internalFramesToSkip)
    formattedStack = toStackTraceString(stackTrace)
  })

  return formattedStack!
}
