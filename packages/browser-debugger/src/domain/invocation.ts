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
 * Opaque handle identifying a single invocation of an instrumented function.
 *
 * Instrumented code stores whatever `onEntry` returns and hands it back to `onReturn`/`onThrow`,
 * so each exit is paired with the entry state of its own invocation. A per-probe stack cannot do
 * that: overlapping asynchronous invocations complete in any order, so popping the latest entry
 * mismatches them.
 *
 * It holds one entry per probe that captured the invocation - probes skipped by sampling, an entry
 * condition or a lifetime budget are absent rather than represented by a placeholder. Slots are
 * emptied as the exit hooks consume them, which is why they may be `undefined`.
 */
export type InvocationHandle = Array<ActiveEntry | undefined>
