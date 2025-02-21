import { callMonitored } from '../monitor'
import type { StackTrace } from './computeStackTrace'
import { computeStackTrace } from './computeStackTrace'

/**
 * Creates a stacktrace without SDK internal frames.
 * Constraints:
 * - Has to be called at the utmost position of the call stack.
 * - No monitored function should encapsulate it, that is why we need to use callMonitored inside it.
 */
export function createHandlingStack(
  type: 'console error' | 'action' | 'error' | 'instrumented method' | 'log' | 'react error'
): string {
  /**
   * Skip the two internal frames:
   * - SDK API (console.error, ...)
   * - this function
   * in order to keep only the user calls
   */
  const internalFramesToSkip = 2
  const error = new Error(`Received ${type}`)
  error.name = 'HandlingStack'
  let formattedStack: string

  callMonitored(() => {
    const stackTrace = computeStackTrace(error)
    stackTrace.stack = stackTrace.stack.slice(internalFramesToSkip)
    formattedStack = toStackTraceString(stackTrace)
  })

  return formattedStack!
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

export function formatErrorMessage(stack: StackTrace) {
  return `${stack.name || 'Error'}: ${stack.message!}`
}
