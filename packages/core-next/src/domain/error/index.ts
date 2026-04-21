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

export type ErrorSource = (typeof ErrorSource)[keyof typeof ErrorSource]

export interface Csp {
  disposition: 'enforce' | 'report'
}

export interface StackFrame {
  url?: string
  func?: string
  args?: string[]
  line?: number
  column?: number
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

export { computeStackTrace } from './computeStackTrace'
export { formatStackTrace, formatErrorMessage, formatFrame } from './formatStackTrace'

export interface ErrorCause {
  message: string
  source?: string
  type?: string
  stack?: string
}

export function flattenCauses(error: Error): ErrorCause[] | undefined {
  if (!('cause' in error)) return undefined

  const causes: ErrorCause[] = []
  let current: unknown = (error as any).cause
  while (current instanceof Error) {
    causes.push({ message: current.message, type: current.name, stack: current.stack })
    current = (current as any).cause
  }

  return causes.length > 0 ? causes : undefined
}

export function extractFingerprint(error: Error | undefined): string | undefined {
  if (!error) return undefined
  return 'dd_fingerprint' in error ? String((error as any).dd_fingerprint) : undefined
}
