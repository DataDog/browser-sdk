import type { RumPublicApi } from '@datadog/browser-rum-core'
import { capture, captureFields } from './capture'
import { type InitializedProbe, checkGlobalSnapshotBudget } from './probes'
import { captureStackTrace, parseStackTrace } from './stacktrace'
import type { StackFrame } from './stacktrace'
import { evaluateProbeMessage } from './template'
import { evaluateProbeCondition } from './condition'

interface ActiveEntry {
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

const active = new Map<string, Array<ActiveEntry | null>>()

/**
 * Called when entering an instrumented function
 * @param probes - Array of probes for this function
 * @param self - The 'this' context
 * @param args - Function arguments
 */
export function onEntry(probes: InitializedProbe[], self: any, args: Record<string, any>): void {
  const start = performance.now()

  // TODO: A lot of repeated work performed for each probe that could be shared between probes
  for (const probe of probes) {
    let stack = active.get(probe.id) // TODO: Should we use the functionId instead?
    if (!stack) {
      stack = []
      active.set(probe.id, stack)
    }

    // Skip if sampling budget is exceeded
    if (
      start - probe.lastCaptureMs < probe.msBetweenSampling ||
      !checkGlobalSnapshotBudget(start, probe.captureSnapshot)
    ) {
      stack.push(null)
      continue
    }

    // Update last capture time
    probe.lastCaptureMs = start

    let timestamp: number | undefined
    let message: string | undefined
    if (probe.evaluateAt === 'ENTRY') {
      // Build context for condition and message evaluation
      const context = { this: self, ...args }

      // Check condition - if it fails, don't evaluate or capture anything
      if (!evaluateProbeCondition(probe, context)) {
        // Still push to stack so onReturn/onThrow can pop it, but mark as skipped
        stack.push(null)
        continue
      }

      timestamp = Date.now()
      message = evaluateProbeMessage(probe, context)
    }

    // Special case for evaluateAt=EXIT with a condition: we only capture the return snapshot
    const shouldCaptureEntrySnapshot = probe.captureSnapshot && (probe.evaluateAt === 'ENTRY' || !probe.condition)
    const entry = shouldCaptureEntrySnapshot
      ? {
          arguments: {
            ...captureFields(args, probe.capture),
            this: capture(self, probe.capture),
          },
        }
      : undefined

    stack.push({
      start,
      timestamp,
      message,
      entry,
      stack: probe.captureSnapshot ? captureStackTrace(1) : undefined,
    })
  }
}

/**
 * Called when exiting an instrumented function normally
 * @param probes - Array of probes for this function
 * @param value - Return value
 * @param self - The 'this' context
 * @param args - Function arguments
 * @param locals - Local variables
 * @returns The return value (passed through)
 */
export function onReturn(
  probes: InitializedProbe[],
  value: any,
  self: any,
  args: Record<string, any>,
  locals: Record<string, any>
): any {
  const end = performance.now()

  // TODO: A lot of repeated work performed for each probe that could be shared between probes
  for (const probe of probes) {
    const stack = active.get(probe.id) // TODO: Should we use the functionId instead?
    if (!stack) continue // TODO: This shouldn't be possible, do we need it? Should we warn?
    const result = stack.pop()
    if (!result) continue

    result.duration = end - result.start

    if (probe.evaluateAt === 'EXIT') {
      result.timestamp = Date.now()

      const context = {
        ...args,
        ...locals,
        this: self,
        $dd_duration: result.duration,
        $dd_return: value,
      }

      if (!evaluateProbeCondition(probe, context)) continue

      result.message = evaluateProbeMessage(probe, context)
    }

    result.return = probe.captureSnapshot
      ? {
          arguments: {
            ...captureFields(args, probe.capture),
            this: capture(self, probe.capture),
          },
          locals: {
            ...captureFields(locals, probe.capture),
            '@return': capture(value, probe.capture),
          },
        }
      : undefined

    done(probe, result)
  }

  return value
}

/**
 * Called when exiting an instrumented function via exception
 * @param probes - Array of probes for this function
 * @param error - The thrown error
 * @param self - The 'this' context
 * @param args - Function arguments
 */
export function onThrow(probes: InitializedProbe[], error: Error, self: any, args: Record<string, any>): void {
  const end = performance.now()

  // TODO: A lot of repeated work performed for each probe that could be shared between probes
  for (const probe of probes) {
    const stack = active.get(probe.id) // TODO: Should we use the functionId instead?
    if (!stack) continue // TODO: This shouldn't be possible, do we need it? Should we warn?
    const result = stack.pop()
    if (!result) continue

    result.duration = end - result.start
    result.exception = error

    if (probe.evaluateAt === 'EXIT') {
      result.timestamp = Date.now()

      const context = {
        ...args,
        this: self,
        $dd_duration: result.duration,
        $dd_exception: error,
      }

      if (!evaluateProbeCondition(probe, context)) continue

      result.message = evaluateProbeMessage(probe, context)
    }

    result.return = {
      arguments: probe.captureSnapshot
        ? {
            ...captureFields(args, probe.capture),
            this: capture(self, probe.capture),
          }
        : undefined,
      throwable: {
        message: error.message,
        stacktrace: parseStackTrace(error),
      },
    }

    done(probe, result)
  }
}

function done(probe: any, result: ActiveEntry): void {
  const snapshot = {
    id: crypto.randomUUID(),
    timestamp: result.timestamp!,
    probe: {
      id: probe.id,
      version: probe.version,
      location: probe.location,
    },
    stack: result.stack,
    language: 'javascript',
    duration: result.duration! * 1e6, // to nanoseconds
    captures:
      result.entry || result.return
        ? {
            entry: result.entry,
            return: result.return,
          }
        : undefined,
  }

  // Send the snapshot to the backend via liveDebug
  const rumApi = (window as Window & { DD_RUM?: RumPublicApi }).DD_RUM
  if (rumApi && typeof rumApi.liveDebug === 'function') {
    // TODO: Fill out logger with the right information
    const logger = {
      name: 'dd.debugger',
      method: probe.location?.method,
      thread_name: 'main',
      thread_id: 1,
      version: rumApi.version,
    }

    // Get the RUM internal context for trace correlation
    const rumContext = rumApi.getInternalContext?.()
    const dd = {
      trace_id: rumContext?.session_id,
      span_id: rumContext?.user_action?.id || rumContext?.view?.id,
    }

    rumApi.liveDebug(result.message, logger, dd, snapshot)
  } else {
    console.warn('DD_RUM.liveDebug is not available. Make sure the RUM SDK is initialized.')
  }
}
