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
