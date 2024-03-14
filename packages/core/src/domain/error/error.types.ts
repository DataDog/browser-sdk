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
  handling?: ErrorHandling
  handlingStack?: string
  causes?: RawErrorCause[]
  fingerprint?: string
  csp?: Csp
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
