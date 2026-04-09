import type { StackTrace, StackFrame } from './index'

/**
 * Serializes a StackTrace into a normalized string format:
 *
 * ```
 * Error: message
 *   at functionName @ http://file.js:10:20
 *   at <anonymous> @ http://file.js:15:5
 * ```
 */
function formatStackTrace(stackTrace: StackTrace): string {
  let result = formatErrorMessage(stackTrace)

  for (const frame of stackTrace.stack) {
    result += `\n  at ${formatFrame(frame)}`
  }

  return result
}

function formatErrorMessage(stackTrace: StackTrace): string {
  const name = stackTrace.name ?? 'Error'
  return stackTrace.message ? `${name}: ${stackTrace.message}` : name
}

function formatFrame(frame: StackFrame): string {
  const func = frame.func === '?' ? '<anonymous>' : (frame.func ?? '<anonymous>')
  const args = frame.args && frame.args.length > 0 ? `(${frame.args.join(', ')})` : ''
  const line = frame.line ? `:${frame.line}` : ''
  const column = frame.line && frame.column ? `:${frame.column}` : ''
  const url = frame.url ? ` @ ${frame.url}${line}${column}` : ''

  return `${func}${args}${url}`
}

export { formatStackTrace, formatErrorMessage, formatFrame }
