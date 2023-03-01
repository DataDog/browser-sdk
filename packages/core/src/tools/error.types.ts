import type { ClocksState } from './timeUtils'

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

export const NonErrorPrefix = {
  UNCAUGHT: 'Uncaught',
  PROVIDED: 'Provided',
} as const

export const enum ErrorHandling {
  HANDLED = 'handled',
  UNHANDLED = 'unhandled',
}

export type NonErrorPrefix = typeof NonErrorPrefix[keyof typeof NonErrorPrefix]
export type ErrorSource = typeof ErrorSource[keyof typeof ErrorSource]
