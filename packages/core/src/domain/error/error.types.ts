import type { Context } from '../../tools/serialisation/context'
import type { ClocksState } from '../../tools/utils/timeUtils'

// TS v4.6 introduced Error.cause[1] typed as `Error`. TS v4.8 changed Error.cause to be
// `unknown`[2].
//
// Because we still support TS 3.8, we need to declare our own type. We can remove it once we drop
// support for TS v4.7 and before. The 'cause' property defined by TS needs to be omitted because
// we define it with a type `unknown` which is incompatible with TS 4.6 and 4.7.
//
// [1]: https://devblogs.microsoft.com/typescript/announcing-typescript-4-6/#target-es2022
// [2]: https://devblogs.microsoft.com/typescript/announcing-typescript-4-8/#lib-d-ts-updates
export interface ErrorWithCause extends Omit<Error, 'cause'> {
  cause?: unknown
}

export type RawErrorCause = {
  message: string
  source: string
  type?: string
  stack?: string
}

export type Csp = {
  disposition: 'enforce' | 'report'
}

export interface RawError {
  startClocks: ClocksState
  message: string
  type?: string
  stack?: string
  source: ErrorSource
  originalError?: unknown
  handling?: ErrorHandlingEnum
  handlingStack?: string
  componentStack?: string
  causes?: RawErrorCause[]
  fingerprint?: string
  csp?: Csp
  context?: Context
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
export type NonErrorPrefixEnum = (typeof NonErrorPrefix)[keyof typeof NonErrorPrefix]

export const ErrorHandling = {
  HANDLED: 'handled',
  UNHANDLED: 'unhandled',
} as const
export type ErrorHandlingEnum = (typeof ErrorHandling)[keyof typeof ErrorHandling]

export type ErrorSource = (typeof ErrorSource)[keyof typeof ErrorSource]
