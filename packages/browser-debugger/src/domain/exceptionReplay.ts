import { globalObject, generateUUID } from '@datadog/js-core/util'
import { timeStampNow } from '@datadog/js-core/time'
import { monitorError } from '@datadog/js-core/monitor'
import { computeStackTrace, isError } from '@datadog/browser-core'
import type { StackTrace } from '@datadog/browser-core'
import type { BrowserWindow } from '../entries/main'
import { captureArguments, queueExceptionSnapshot } from './api'
import type { CaptureContext } from './capture'
import { formatThrowable, formatUnknownError, safeReadErrorProperty } from './error'
import { checkGlobalSnapshotBudget } from './probes'
import { mapStackFrames } from './stacktrace'

// Like the Java tracer, only capture the innermost frames, which are closest to the cause.
const MAX_FRAMES_PER_EXCEPTION = 3

// Exceptions are captured as they're thrown, before it's known whether they will be reported, so
// cap the work for code that throws and catches a lot of exceptions.
const MAX_EXCEPTIONS_CAPTURED_PER_SECOND = 10

// Like the tracers, report snapshots for a given exception fingerprint at most once an hour.
const FINGERPRINT_COOLDOWN_MS = 60 * 60 * 1000
const MAX_FINGERPRINTS = 1000

const SNAPSHOT_TIMEOUT_MS = 10

/**
 * Links the snapshots of a reported exception to its RUM error event.
 */
export interface ExceptionReplayAttributes {
  exceptionId: string
  /**
   * Frames with a snapshot, innermost first. `index` is the frame's position in the error's stack,
   * as parsed by `computeStackTrace`, which is how RUM formats the error event's `error.stack`.
   */
  frames: Array<{ index: number; snapshotId: string }>
}

interface CapturedFrame {
  functionId: string
  timestamp: number
  arguments: Record<string, any>
  // Created in `onCatch`, so its stack starts with `onCatch`, followed by the instrumented function
  callStack: Error
}

interface CapturedException {
  fingerprint: string
  frames: CapturedFrame[]
  // Set when the exception is first reported, so reporting it again reuses the same snapshots
  attributes?: ExceptionReplayAttributes | null
}

let capturedExceptions = new WeakMap<object, CapturedException | false>()
let lastReportByFingerprint = new Map<string, number>()
let captureWindowStart = -Infinity
let capturesInWindow = 0
let pluginRegistered = false
let debuggerStarted = false

/**
 * Called when the Exception Replay plugin is registered on the RUM Browser SDK.
 */
export function registerExceptionReplayPlugin(): void {
  pluginRegistered = true
  installCatchHook()
}

/**
 * Called when the Live Debugger SDK is initialized, which provides the transport for snapshots.
 */
export function startExceptionReplay(): void {
  debuggerStarted = true
  installCatchHook()
}

export function resetExceptionReplay(): void {
  capturedExceptions = new WeakMap()
  lastReportByFingerprint = new Map()
  captureWindowStart = -Infinity
  capturesInWindow = 0
  pluginRegistered = false
  debuggerStarted = false
  delete (globalObject as BrowserWindow).$dd_catch
}

// Instrumented code only calls `$dd_catch` once it's defined, so Exception Replay costs nothing
// until both the plugin and the transport are there.
function installCatchHook(): void {
  if (pluginRegistered && debuggerStarted) {
    ;(globalObject as BrowserWindow).$dd_catch = onCatch
  }
}

/**
 * Called by instrumented code built with Exception Replay enabled, for every exception that leaves
 * an instrumented function, whether or not a probe is active. An exception reaches the innermost
 * function first.
 *
 * Captures the arguments of the function's frame, and keeps them with the exception until RUM
 * reports it (see {@link collectExceptionReplay}). The captures of exceptions that are never
 * reported are garbage collected with them.
 *
 * Never throws: it runs in the instrumented function's catch block, before the exception is
 * rethrown.
 *
 * @param functionId - ID of the instrumented function
 * @param error - The thrown value
 * @param self - The 'this' context
 * @param args - Function arguments
 */
export function onCatch(functionId: string, error: unknown, self: unknown, args: Record<string, unknown> = {}): void {
  try {
    // Captures are kept with the thrown value, which must be an object for that
    if (!isObject(error)) {
      return
    }

    let exception = capturedExceptions.get(error)
    if (exception === undefined) {
      exception = startCapture(functionId, error)
      capturedExceptions.set(error, exception)
    }

    if (!exception || exception.attributes !== undefined || exception.frames.length >= MAX_FRAMES_PER_EXCEPTION) {
      return
    }

    const captureCtx: CaptureContext = {
      deadline: performance.now() + SNAPSHOT_TIMEOUT_MS,
      timedOut: false,
      // Unlike probes, Exception Replay captures data nobody asked for, so redact sensitive names
      redact: true,
    }
    exception.frames.push({
      functionId,
      timestamp: timeStampNow(),
      arguments: captureArguments(args, self, {}, captureCtx),
      callStack: new Error(),
    })
  } catch (e) {
    monitorError(e)
  }
}

function startCapture(functionId: string, error: object): CapturedException | false {
  const now = performance.now()
  // The innermost instrumented function is the first one to see the exception
  const errorType = isError(error) ? safeReadErrorProperty(error, 'name') : undefined
  const fingerprint = `${errorType ?? ''};${functionId}`

  if (isCoolingDown(fingerprint, now)) {
    return false
  }

  if (now - captureWindowStart > 1000) {
    captureWindowStart = now
    capturesInWindow = 0
  }
  if (capturesInWindow >= MAX_EXCEPTIONS_CAPTURED_PER_SECOND) {
    return false
  }
  capturesInWindow++

  return { fingerprint, frames: [] }
}

/**
 * Called when RUM reports an error. Sends the snapshots captured for the exception, and returns the
 * attributes linking them to the RUM error event, or undefined if it has none.
 */
export function collectExceptionReplay(error: unknown): ExceptionReplayAttributes | undefined {
  try {
    if (!isObject(error)) {
      return
    }

    const exception = capturedExceptions.get(error)
    if (!exception) {
      return
    }

    if (exception.attributes === undefined) {
      exception.attributes = sendSnapshots(error, exception)
    }
    return exception.attributes ?? undefined
  } catch (e) {
    monitorError(e)
  }
}

function sendSnapshots(error: object, exception: CapturedException): ExceptionReplayAttributes | null {
  const capturedFrames = exception.frames
  // Release the captures: the exception can't capture more frames once it's reported
  exception.frames = []

  // Another exception with the same fingerprint may have been reported since this one was captured
  if (isCoolingDown(exception.fingerprint, performance.now())) {
    return null
  }

  const errorFrames = computeStackTrace(error).stack
  const exceptionId = generateUUID()
  const message = formatUnknownError(error)
  const throwable = formatThrowable(error)
  const frames: ExceptionReplayAttributes['frames'] = []

  let fromIndex = 0
  for (const frame of capturedFrames) {
    const callFrames = computeStackTrace(frame.callStack).stack
    const index = findFrameIndex(errorFrames, callFrames, fromIndex)
    if (index === undefined) {
      continue
    }

    if (!checkGlobalSnapshotBudget(performance.now(), true)) {
      break
    }

    const snapshotId = generateUUID()
    const separatorIndex = frame.functionId.lastIndexOf(';')
    const queued = queueExceptionSnapshot({
      id: snapshotId,
      exceptionId,
      timestamp: frame.timestamp,
      message,
      location: {
        type: frame.functionId.slice(0, separatorIndex),
        method: frame.functionId.slice(separatorIndex + 1),
      },
      stack: mapStackFrames(callFrames, 1),
      arguments: frame.arguments,
      throwable,
    })
    if (!queued) {
      break
    }

    frames.push({ index, snapshotId })
    fromIndex = index + 1
  }

  if (frames.length === 0) {
    return null
  }

  recordReport(exception.fingerprint)
  return { exceptionId, frames }
}

function isCoolingDown(fingerprint: string, now: number): boolean {
  const lastReport = lastReportByFingerprint.get(fingerprint)
  return lastReport !== undefined && now - lastReport < FINGERPRINT_COOLDOWN_MS
}

function recordReport(fingerprint: string): void {
  // Re-insert the fingerprint so the map stays ordered by report time, oldest first
  lastReportByFingerprint.delete(fingerprint)
  lastReportByFingerprint.set(fingerprint, performance.now())
  if (lastReportByFingerprint.size > MAX_FINGERPRINTS) {
    lastReportByFingerprint.delete(lastReportByFingerprint.keys().next().value!)
  }
}

/**
 * Find the index, in the error's stack, of the instrumented function that captured `callFrames`.
 *
 * `callFrames` is the stack captured in `onCatch`: `onCatch` itself, then the instrumented
 * function, then its callers. The callers are still paused at the call sites they were at when the
 * exception was thrown, so they're the frames that follow the function in the error's stack. The
 * function's own frame differs, as it has moved to its catch block, so only its URL is compared.
 *
 * Both stacks can be truncated (V8 keeps 10 frames by default), so only the callers present in both
 * are compared.
 */
function findFrameIndex(
  errorFrames: StackTrace['stack'],
  callFrames: StackTrace['stack'],
  fromIndex: number
): number | undefined {
  const functionFrame = callFrames[1]
  if (!functionFrame?.url) {
    return
  }

  const callers = callFrames.slice(2)
  for (let index = fromIndex; index < errorFrames.length; index++) {
    if (errorFrames[index].url !== functionFrame.url) {
      continue
    }

    const comparedCount = Math.min(callers.length, errorFrames.length - index - 1)
    // A function with callers needs at least one of them in the error's stack to confirm the match.
    // A function without callers is at the bottom of both stacks.
    if (callers.length > 0 ? comparedCount === 0 : index !== errorFrames.length - 1) {
      continue
    }

    let matches = true
    for (let i = 0; i < comparedCount && matches; i++) {
      matches = isSameLocation(callers[i], errorFrames[index + 1 + i])
    }
    if (matches) {
      return index
    }
  }
}

function isSameLocation(a: StackTrace['stack'][number], b: StackTrace['stack'][number]): boolean {
  return a.url === b.url && a.line === b.line && a.column === b.column
}

function isObject(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}
