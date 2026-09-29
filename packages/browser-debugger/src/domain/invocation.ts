import type { StackFrame } from './stacktrace'
import type { EvaluationError } from './condition'
import type { Throwable } from './error'
import type { InitializedProbe } from './probes'

type CapturedFields = Record<string, any>

interface ActiveEntryThrowable {
  throwable?: Throwable
}

type ActiveEntryEntry =
  { arguments: CapturedFields; captureExpressions?: never } | { arguments?: never; captureExpressions: CapturedFields }

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
  probe: InitializedProbe
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

/**
 * Opaque handle identifying one invocation of an instrumented function. Instrumented code stores
 * what `onEntry` returns and hands it back to the exit hooks, pairing each exit with its own
 * invocation. Holds one entry per probe that captured; slots are emptied as exit hooks consume them.
 */
export type InvocationHandle = Array<ActiveEntry | undefined>
