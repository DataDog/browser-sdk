import { StackTrace } from '../domain/tracekit'
import { RelativeTime } from './timeUtils'
import { jsonStringify } from './utils'

export interface RawError {
  startTime: RelativeTime
  message: string
  type?: string
  stack?: string
  source: ErrorSource
  resource?: {
    url: string
    statusCode: number
    method: string
  }
}

export const ErrorSource = {
  AGENT: 'agent',
  CONSOLE: 'console',
  CUSTOM: 'custom',
  LOGGER: 'logger',
  NETWORK: 'network',
  SOURCE: 'source',
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ErrorSource = typeof ErrorSource[keyof typeof ErrorSource]

export function formatUnknownError(stackTrace: StackTrace | undefined, errorObject: any, nonErrorPrefix: string) {
  if (!stackTrace || (stackTrace.message === undefined && !(errorObject instanceof Error))) {
    return {
      message: `${nonErrorPrefix} ${jsonStringify(errorObject)!}`,
      stack: 'No stack, consider using an instance of Error',
      type: stackTrace && stackTrace.name,
    }
  }

  return {
    message: stackTrace.message || 'Empty message',
    stack: toStackTraceString(stackTrace),
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

export function formatErrorMessage(stack: StackTrace) {
  return `${stack.name || 'Error'}: ${stack.message!}`
}
