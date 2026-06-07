import type { StackFrame } from './stacktrace'
import type { EvaluationError } from './condition'

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- `type` is needed for implicit index signature compatibility with Context
export type Throwable = {
  message: string
  stacktrace: StackFrame[]
}

export interface ActiveEntry {
  start: number
  timestamp?: number
  message?: string
  evaluationErrors?: EvaluationError[]
  entry?: {
    arguments: Record<string, any>
  }
  stack?: StackFrame[]
  duration?: number
  return?: {
    arguments?: Record<string, any>
    locals?: Record<string, any>
    throwable?: Throwable
  }
  exception?: unknown
}
