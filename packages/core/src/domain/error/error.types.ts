import type { ClocksState } from '../../tools/utils/timeUtils'

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
  fingerprint?: string
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

export const enum NonErrorPrefix {
  UNCAUGHT = 'Uncaught',
  PROVIDED = 'Provided',
}

export const enum ErrorHandling {
  HANDLED = 'handled',
  UNHANDLED = 'unhandled',
}

export type ErrorSource = (typeof ErrorSource)[keyof typeof ErrorSource]
