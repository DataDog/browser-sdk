import type { StackTrace } from '../domain/tracekit'
import { computeStackTrace } from '../domain/tracekit'
import { callMonitored } from './monitor'
import type { ClocksState } from './timeUtils'
import { jsonStringify, noop } from './utils'

export interface ErrorWithCause extends Error {
  cause?: Error
}

export type RawErrorCause = {
  message: string
  source: string
  type?: string
  stack?: string
}

export interface RawError {
  startClocks: ClocksState
  message: string
  type?: string
  stack?: string
  source: ErrorSource
  originalError?: unknown
  handling?: ErrorHandling
  handlingStack?: string
  causes?: RawErrorCause[]
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

export type ErrorSource = typeof ErrorSource[keyof typeof ErrorSource]

type RawErrorParams = {
  stackTrace?: StackTrace
  originalError: unknown

  handlingStack?: string
  startClocks: ClocksState
  nonErrorPrefix: string
  source: ErrorSource
  handling: ErrorHandling
}

export function computeRawError({
  stackTrace,
  originalError,
  handlingStack,
  startClocks,
  nonErrorPrefix,
  source,
  handling,
}: RawErrorParams): RawError {
  if (!stackTrace || (stackTrace.message === undefined && !(originalError instanceof Error))) {
    return {
      startClocks,
      source,
      handling,
      originalError,
      message: `${nonErrorPrefix} ${jsonStringify(originalError)!}`,
      stack: 'No stack, consider using an instance of Error',
      handlingStack,
      type: stackTrace && stackTrace.name,
    }
  }

  return {
    startClocks,
    source,
    handling,
    originalError,
    message: stackTrace.message || 'Empty message',
    stack: toStackTraceString(stackTrace),
    handlingStack,
    type: stackTrace.name,
    causes: flattenErrorCauses(originalError as ErrorWithCause, source),
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

export function flattenErrorCauses(error: ErrorWithCause, parentSource: ErrorSource): RawErrorCause[] | undefined {
  let currentError = error
  const causes: RawErrorCause[] = []
  while (currentError?.cause instanceof Error && causes.length < 10) {
    const stackTrace = computeStackTrace(currentError.cause)
    causes.push({
      message: currentError.cause.message,
      source: parentSource,
      type: stackTrace?.name,
      stack: stackTrace && toStackTraceString(stackTrace),
    })
    currentError = currentError.cause
  }
  return causes.length ? causes : undefined
}
