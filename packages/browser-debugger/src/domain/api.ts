import type { Batch, Context, ContextValue } from '@datadog/browser-core'
import { timeStampNow } from '@datadog/js-core/time'
import { buildTag, generateUUID, globalObject, mergeArrays } from '@datadog/browser-core'
import type { BrowserWindow, DebuggerInitConfiguration } from '../entries/main'
import { capture, captureFields } from './capture'
import type { CaptureContext } from './capture'
import type { InitializedProbe } from './probes'
import {
  checkConditionErrorBudget,
  checkGlobalSnapshotBudget,
  enforceProbeLifetimeBudget,
  recordProbeEventSent,
  resetProbeBudgetConfiguration,
  setProbeBudgetConfiguration,
} from './probes'
import type { ActiveEntry } from './activeEntries'
import { captureStackTrace } from './stacktrace'
import { evaluateProbeMessage } from './template'
import { evaluateProbeCondition, isConditionEvaluationError } from './condition'
import { display } from './display'
import { formatThrowable } from './error'
import { evaluateCaptureExpressions } from './captureExpressions'

const globalObj = globalObject as BrowserWindow

const threadName = detectThreadName() // eslint-disable-line local-rules/disallow-side-effects

const SNAPSHOT_TIMEOUT_MS = 10

let debuggerBatch: Batch | undefined
let debuggerConfig: DebuggerInitConfiguration | undefined
let cachedDDtags: string | undefined

export function initDebuggerTransport(config: DebuggerInitConfiguration, batch: Batch): void {
  debuggerConfig = config
  debuggerBatch = batch
  cachedDDtags = undefined
  setProbeBudgetConfiguration(config)
}

export function resetDebuggerTransport(): void {
  debuggerBatch = undefined
  debuggerConfig = undefined
  cachedDDtags = undefined
  resetProbeBudgetConfiguration()
}

/**
 * Called when entering an instrumented function
 *
 * @param probes - Array of probes for this function
 * @param self - The 'this' context
 * @param args - Function arguments
 */
export function onEntry(probes: InitializedProbe[], self: any, args: Record<string, any> = {}): void {
  const start = performance.now()
  const captureCtx: CaptureContext = { deadline: start + SNAPSHOT_TIMEOUT_MS, timedOut: false }

  // TODO: A lot of repeated work performed for each probe that could be shared between probes
  for (const probe of probes) {
    if (!enforceProbeLifetimeBudget(probe)) {
      continue
    }

    // Skip if sampling budget is exceeded
    if (
      start - probe.lastCaptureMs < probe.msBetweenSampling ||
      !checkGlobalSnapshotBudget(start, isSnapshotProducingProbe(probe))
    ) {
      probe.activeEntries.push(null)
      continue
    }

    // Update last capture time
    probe.lastCaptureMs = start

    let timestamp: number | undefined
    let message: string | undefined
    let entryCaptureExpressions: Record<string, any> | undefined
    let evaluationErrors: ActiveEntry['evaluationErrors'] | undefined
    if (probe.evaluateAt === 'ENTRY') {
      // Build context for condition and message evaluation
      const context = { ...args, this: self }

      try {
        // Check condition - if it fails, don't evaluate or capture anything
        if (!evaluateProbeCondition(probe, context)) {
          // Still push to stack so onReturn/onThrow can pop it, but mark as skipped
          probe.activeEntries.push(null)
          continue
        }
      } catch (error) {
        if (isConditionEvaluationError(error) && checkConditionErrorBudget(probe, start)) {
          queueDebuggerSnapshot(probe, {
            start,
            timestamp: timeStampNow(),
            evaluationErrors: [error.evaluationError],
          })
        }
        // Still push to stack so onReturn/onThrow can pop it, but mark as skipped
        probe.activeEntries.push(null)
        continue
      }

      timestamp = timeStampNow()
      message = evaluateProbeMessage(probe, context)

      const captureExpressionsResult = evaluateCaptureExpressions(probe, context, captureCtx)
      if (captureExpressionsResult) {
        entryCaptureExpressions = captureExpressionsResult.values
        evaluationErrors = captureExpressionsResult.evaluationErrors
        if (captureCtx.timedOut) {
          probe.activeEntries.push(null)
          continue
        }
      }
    }

    // Special case for evaluateAt=EXIT with a condition: we only capture the return snapshot
    const shouldCaptureEntrySnapshot = probe.captureSnapshot && (probe.evaluateAt === 'ENTRY' || !probe.condition)
    let entry: ActiveEntry['entry'] | undefined
    if (shouldCaptureEntrySnapshot) {
      entry = {
        arguments: captureArguments(args, self, probe.capture, captureCtx),
      }
      if (captureCtx.timedOut) {
        probe.activeEntries.push(null)
        continue
      }
    } else if (entryCaptureExpressions) {
      entry = {
        captureExpressions: entryCaptureExpressions,
      }
    }

    probe.activeEntries.push({
      start,
      timestamp,
      message,
      evaluationErrors,
      entry,
      stack: isSnapshotProducingProbe(probe) ? captureStackTrace(1) : undefined,
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
  args: Record<string, any> = {},
  locals: Record<string, any> = {}
): any {
  const end = performance.now()
  const captureCtx: CaptureContext = { deadline: performance.now() + SNAPSHOT_TIMEOUT_MS, timedOut: false }

  // TODO: A lot of repeated work performed for each probe that could be shared between probes
  for (const probe of probes) {
    const result = probe.activeEntries.pop()
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

      try {
        if (!evaluateProbeCondition(probe, context)) {
          continue
        }
      } catch (error) {
        if (isConditionEvaluationError(error) && checkConditionErrorBudget(probe, end)) {
          queueDebuggerSnapshot(probe, {
            start: result.start,
            timestamp: result.timestamp,
            duration: result.duration,
            evaluationErrors: [error.evaluationError],
          })
        }
        continue
      }

      result.message = evaluateProbeMessage(probe, context)

      if (!probe.captureSnapshot) {
        const captureExpressionsResult = evaluateCaptureExpressions(probe, context, captureCtx)
        if (captureExpressionsResult) {
          if (captureExpressionsResult.values) {
            result.return = {
              captureExpressions: captureExpressionsResult.values,
            }
          }
          result.evaluationErrors = mergeArrays(result.evaluationErrors, captureExpressionsResult.evaluationErrors)
          if (captureCtx.timedOut) {
            continue
          }
        }
      }
    }

    if (probe.captureSnapshot) {
      result.return = {
        arguments: captureArguments(args, self, probe.capture, captureCtx),
        locals: {
          ...captureFields(locals, probe.capture, captureCtx),
          '@return': capture(value, probe.capture, captureCtx),
        },
      }
      if (captureCtx.timedOut) {
        continue
      }
    }

    queueDebuggerSnapshot(probe, result)
  }

  return value
}

/**
 * Called when exiting an instrumented function via exception
 *
 * @param probes - Array of probes for this function
 * @param error - The thrown value
 * @param self - The 'this' context
 * @param args - Function arguments
 */
export function onThrow(probes: InitializedProbe[], error: unknown, self: any, args: Record<string, any> = {}): void {
  const end = performance.now()
  const captureCtx: CaptureContext = { deadline: performance.now() + SNAPSHOT_TIMEOUT_MS, timedOut: false }

  // TODO: A lot of repeated work performed for each probe that could be shared between probes
  for (const probe of probes) {
    const result = probe.activeEntries.pop()
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

      try {
        if (!evaluateProbeCondition(probe, context)) {
          continue
        }
      } catch (error) {
        if (isConditionEvaluationError(error) && checkConditionErrorBudget(probe, end)) {
          queueDebuggerSnapshot(probe, {
            start: result.start,
            timestamp: result.timestamp,
            duration: result.duration,
            evaluationErrors: [error.evaluationError],
          })
        }
        continue
      }

      result.message = evaluateProbeMessage(probe, context)

      if (!probe.captureSnapshot) {
        const captureExpressionsResult = evaluateCaptureExpressions(probe, context, captureCtx)
        if (captureExpressionsResult) {
          if (captureExpressionsResult.values) {
            result.return = {
              captureExpressions: captureExpressionsResult.values,
            }
          }
          result.evaluationErrors = mergeArrays(result.evaluationErrors, captureExpressionsResult.evaluationErrors)
          if (captureCtx.timedOut) {
            continue
          }
        }
      }
    }

    let throwArguments: Record<string, any> | undefined
    if (probe.captureSnapshot) {
      throwArguments = captureArguments(args, self, probe.capture, captureCtx)
      if (captureCtx.timedOut) {
        continue
      }
    }

    const throwable = formatThrowable(error)
    if (throwArguments) {
      result.return = { arguments: throwArguments, throwable }
    } else if (result.return?.captureExpressions) {
      result.return = { captureExpressions: result.return.captureExpressions, throwable }
    } else {
      result.return = { throwable }
    }

    queueDebuggerSnapshot(probe, result)
  }
}

/**
 * Queue a debugger snapshot for delivery via the debugger's own transport.
 *
 * @param probe - The probe that was executed
 * @param result - The result of the probe execution
 */
function queueDebuggerSnapshot(probe: InitializedProbe, result: ActiveEntry): void {
  if (!debuggerBatch || !debuggerConfig) {
    display.warn('Transport is not initialized. Make sure DD_DEBUGGER.init() has been called.')
    return
  }

  const version = globalObj.DD_DEBUGGER!.version
  const captures = (
    result.entry || result.return
      ? {
          entry: result.entry,
          return: result.return,
        }
      : undefined
  ) as ContextValue

  const payload: Context = {
    message: result.message,
    service: debuggerConfig.service,
    ddtags: getDebuggerDDtags(version),
    // TODO: Fill out logger with the right information
    logger: {
      name: probe.where.typeName,
      method: probe.where.methodName,
      version,
      // thread_id: 1,
      thread_name: threadName,
    },
    debugger: {
      snapshot: {
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
        evaluationErrors: result.evaluationErrors,
        stack: result.stack,
        language: 'javascript',
        duration: result.duration === undefined ? undefined : result.duration * 1e6, // to nanoseconds (might be undefined in case of eval errors)
        captures,
      },
    },
  }

  debuggerBatch.add(payload)
  recordProbeEventSent(probe)
}

function captureArguments(
  args: Record<string, any>,
  self: any,
  captureOptions: InitializedProbe['capture'],
  captureCtx: CaptureContext
): Record<string, any> {
  const fields = captureFields(args, captureOptions, captureCtx)
  if (self !== globalObject) {
    fields.this = capture(self, captureOptions, captureCtx)
  }
  return fields
}

function getDebuggerDDtags(debuggerVersion: string): string {
  if (!cachedDDtags) {
    cachedDDtags = [
      buildTag('sdk_version', debuggerVersion),
      buildTag('debugger_version', debuggerVersion),
      buildTag('env', debuggerConfig?.env),
      buildTag('service', debuggerConfig?.service),
      buildTag('version', debuggerConfig?.version),
    ].join(',')
  }

  return cachedDDtags
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

function isSnapshotProducingProbe(probe: InitializedProbe): boolean {
  return probe.captureSnapshot || (probe.compiledCaptureExpressions?.expressions.length ?? 0) > 0
}

declare const ServiceWorkerGlobalScope: typeof EventTarget
declare function importScripts(...urls: string[]): void
