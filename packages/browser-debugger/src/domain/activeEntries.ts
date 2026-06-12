import type { StackFrame } from './stacktrace'
import type { EvaluationError } from './condition'
import type { Throwable } from './error'

type CapturedFields = Record<string, any>

interface ActiveEntryThrowable {
  throwable?: Throwable
}

type ActiveEntryEntry =
  | { arguments: CapturedFields; captureExpressions?: never }
  | { arguments?: never; captureExpressions: CapturedFields }

type ActiveEntryReturn =
  | (ActiveEntryThrowable & {
      arguments: CapturedFields
      locals?: CapturedFields
      captureExpressions?: never
    })
  | (ActiveEntryThrowable & {
      arguments?: never
      locals?: never
      captureExpressions: CapturedFields
    })
  | (ActiveEntryThrowable & {
      arguments?: never
      locals?: never
      captureExpressions?: never
      throwable: NonNullable<ActiveEntryThrowable['throwable']>
    })

export interface ActiveEntry {
  start: number
  timestamp?: number
  message?: string
  evaluationErrors?: EvaluationError[]
  entry?: ActiveEntryEntry
  stack?: StackFrame[]
  duration?: number
  return?: ActiveEntryReturn
  exception?: unknown
}
