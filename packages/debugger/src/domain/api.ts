import type { Batch, Context, RumInternalContext } from '@datadog/browser-core'

import { timeStampNow, display, buildTag, generateUUID, getGlobalObject } from '@datadog/browser-core'
import type { BrowserWindow, DebuggerInitConfiguration } from '../entries/main'
import { capture, captureFields } from './capture'
import type { InitializedProbe } from './probes'
import { checkGlobalSnapshotBudget } from './probes'
import type { ActiveEntry } from './activeEntries'
import { active } from './activeEntries'
import { captureStackTrace, parseStackTrace } from './stacktrace'
import { evaluateProbeMessage } from './template'
import { evaluateProbeCondition } from './condition'

interface Rum {
  getInternalContext?: () => RumInternalContext | undefined
}

interface TraceCorrelationContext extends Context {
  trace_id: string
  span_id: string
}

// Cache hostname at module initialization since it won't change during the app lifetime
const globalObj = getGlobalObject<BrowserWindow & { DD_RUM?: Rum }>() // eslint-disable-line local-rules/disallow-side-effects
const hostname = 'location' in globalObj ? globalObj.location.hostname : 'unknown'

const threadName = detectThreadName() // eslint-disable-line local-rules/disallow-side-effects

let debuggerBatch: Batch | undefined
let debuggerConfig: DebuggerInitConfiguration | undefined

export function initDebuggerTransport(config: DebuggerInitConfiguration, batch: Batch): void {
  debuggerConfig = config
  debuggerBatch = batch
}

export function resetDebuggerTransport(): void {
  debuggerBatch = undefined
  debuggerConfig = undefined
  active.clear()
}

/**
 * Called when entering an instrumented function
 *
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
      const context = { ...args, this: self }

      // Check condition - if it fails, don't evaluate or capture anything
      if (!evaluateProbeCondition(probe, context)) {
        // Still push to stack so onReturn/onThrow can pop it, but mark as skipped
        stack.push(null)
        continue
      }

      timestamp = timeStampNow()
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
 *
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
    if (!stack) {
      continue // TODO: This shouldn't be possible, do we need it? Should we warn?
    }
    const result = stack.pop()
    if (stack.length === 0) {
      active.delete(probe.id)
    }
    if (!result) {
      continue
    }

    result.duration = end - result.start

    if (probe.evaluateAt === 'EXIT') {
      result.timestamp = timeStampNow()

      const context = {
        ...args,
        ...locals,
        this: self,
        $dd_duration: result.duration,
        $dd_return: value,
      }

      if (!evaluateProbeCondition(probe, context)) {
        continue
      }

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

    sendDebuggerSnapshot(probe, result)
  }

  return value
}

/**
 * Called when exiting an instrumented function via exception
 *
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
    if (!stack) {
      continue // TODO: This shouldn't be possible, do we need it? Should we warn?
    }
    const result = stack.pop()
    if (stack.length === 0) {
      active.delete(probe.id)
    }
    if (!result) {
      continue
    }

    result.duration = end - result.start
    result.exception = error

    if (probe.evaluateAt === 'EXIT') {
      result.timestamp = timeStampNow()

      const context = {
        ...args,
        this: self,
        $dd_duration: result.duration,
        $dd_exception: error,
      }

      if (!evaluateProbeCondition(probe, context)) {
        continue
      }

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

    sendDebuggerSnapshot(probe, result)
  }
}

/**
 * Send a debugger snapshot to Datadog via the debugger's own transport.
 *
 * @param probe - The probe that was executed
 * @param result - The result of the probe execution
 */
function sendDebuggerSnapshot(probe: InitializedProbe, result: ActiveEntry): void {
  if (!debuggerBatch || !debuggerConfig) {
    display.warn('Debugger transport is not initialized. Make sure DD_DEBUGGER.init() has been called.')
    return
  }

  const snapshot = {
    id: generateUUID(),
    timestamp: result.timestamp!,
    probe: {
      id: probe.id,
      version: probe.version,
      location: {
        // TODO: Are our hardcoded where.* keys correct according to the spec?
        method: probe.where.methodName,
        type: probe.where.typeName,
      },
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

  const debuggerApi = globalObj.DD_DEBUGGER!

  // TODO: Fill out logger with the right information
  const logger = {
    name: probe.where.typeName,
    method: probe.where.methodName,
    version: debuggerApi.version,
    // thread_id: 1,
    thread_name: threadName,
  }

  // Get the RUM internal context for trace correlation
  const dd = getTraceCorrelationContext()

  const ddtags = [
    buildTag('sdk_version', debuggerApi.version),
    buildTag('env', debuggerConfig.env),
    buildTag('service', debuggerConfig.service),
    buildTag('version', debuggerConfig.version),
    buildTag('debugger_version', debuggerApi.version),
    buildTag('host_name', hostname),
    buildTag('application_id', debuggerConfig.applicationId),
  ]

  const payload: Context = {
    message: result.message || '',
    hostname,
    service: debuggerConfig.service,
    application_id: debuggerConfig.applicationId,
    ddtags: ddtags.join(','),
    logger,
    ...(dd ? { dd } : {}),
    debugger: { snapshot },
  }

  debuggerBatch.add(payload)
}

function detectThreadName() {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'main'
  }
  if (typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope) {
    return 'service-worker'
  }
  if (typeof importScripts === 'function') {
    return 'web-worker'
  }
  return 'unknown'
}

function getTraceCorrelationContext(): TraceCorrelationContext | undefined {
  const rumContext = globalObj.DD_RUM?.getInternalContext?.()
  const traceId = getStringContextValue(rumContext, 'trace_id')
  const spanId = getStringContextValue(rumContext, 'span_id')

  return traceId && spanId
    ? {
        trace_id: traceId,
        span_id: spanId,
      }
    : undefined
}

function getStringContextValue(context: Context | undefined, key: string): string | undefined {
  const value = context?.[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

declare const ServiceWorkerGlobalScope: typeof EventTarget
declare function importScripts(...urls: string[]): void
