import type { StackFrame } from './stacktrace'

export interface ActiveEntry {
  start: number
  timestamp?: number
  message?: string
  entry?: {
    arguments: Record<string, any>
  }
  stack?: StackFrame[]
  duration?: number
  return?: {
    arguments?: Record<string, any>
    locals?: Record<string, any>
    throwable?: {
      message: string
      stacktrace: StackFrame[]
    }
  }
  exception?: Error
}

export const active = new Map<string, Array<ActiveEntry | null>>()

export function clearActiveEntries(probeId?: string): void {
  if (probeId !== undefined) {
    active.delete(probeId)
  } else {
    active.clear()
  }
}
