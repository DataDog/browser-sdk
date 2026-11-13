import { globalObject, generateUUID } from '@datadog/js-core/util'
import { timeStampNow } from '@datadog/js-core/time'
import { monitorError } from '@datadog/js-core/monitor'
import { computeStackTrace, isError } from '@datadog/browser-core'
import type { StackTrace } from '@datadog/browser-core'
import type { BrowserWindow } from '../entries/main'
import { captureArguments, isDebuggerTransportInitialized, queueExceptionSnapshot } from './api'
import type { ExceptionSnapshot } from './api'
import type { CaptureContext } from './capture'
import { formatThrowable, formatUnknownError, safeReadErrorProperty } from './error'
import { mapStackFrames } from './stacktrace'

// Like the Java tracer, only capture the innermost frames, which are closest to the cause.
const MAX_FRAMES_PER_EXCEPTION = 3

// Exceptions are captured as they're thrown, before it's known whether they will be reported, so
// cap the work for code that throws and catches a lot of exceptions. These limits are separate from
// the probes' snapshot budget, so neither feature can use up the other's.
const MAX_EXCEPTIONS_CAPTURED_PER_SECOND = 10

// Capturing blocks the main thread, so also cap the time it takes. The deadline can't interrupt
// everything, such as reading the property names of a huge object, so time spent beyond the budget
// is carried over, and capturing pauses until the budget recovers.
const CAPTURE_BUDGET_MS_PER_SECOND = 25

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
  // Snapshots of a reported exception, until RUM collects its error event
  pendingSnapshots?: ExceptionSnapshot[]
}

let capturedExceptions = new WeakMap<object, CapturedException | false>()
let lastReportByFingerprint = new Map<string, number>()
let captureWindowStart = -Infinity
let capturesInWindow = 0
let captureBudgetMs = CAPTURE_BUDGET_MS_PER_SECOND
let captureBudgetUpdatedAt = -Infinity
let pluginRegistered = false
let debuggerStarted = false
let isSessionTracked: () => boolean = () => true

/**
 * Called when the Exception Replay plugin is registered on the RUM Browser SDK.
 *
 * @param isTracked - Whether RUM tracks the current session
 */
export function registerExceptionReplayPlugin(isTracked: () => boolean): void {
  pluginRegistered = true
  isSessionTracked = isTracked
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
  captureBudgetMs = CAPTURE_BUDGET_MS_PER_SECOND
  captureBudgetUpdatedAt = -Infinity
  pluginRegistered = false
  debuggerStarted = false
  isSessionTracked = () => true
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
    // RUM only reports the stack of errors, which their snapshots are linked to
    if (!isError(error)) {
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

    const start = performance.now()
    const budgetMs = refillCaptureBudget(start)
    if (budgetMs <= 0) {
      return
    }

    const captureCtx: CaptureContext = {
      deadline: start + Math.min(SNAPSHOT_TIMEOUT_MS, budgetMs),
      timedOut: false,
      // Unlike probes, Exception Replay captures data nobody asked for, so redact sensitive names
      redact: true,
    }
    try {
      exception.frames.push({
        functionId,
        timestamp: timeStampNow(),
        arguments: captureArguments(args, self, {}, captureCtx),
        callStack: new Error(),
      })
    } finally {
      // Charge the time actually spent, which can go past the deadline, even if capturing threw
      captureBudgetMs -= performance.now() - start
    }
  } catch (e) {
    monitorError(e)
  }
}

function startCapture(functionId: string, error: Error): CapturedException | false {
  const now = performance.now()
  // The innermost instrumented function is the first one to see the exception
  const fingerprint = `${safeReadErrorProperty(error, 'name') ?? ''};${functionId}`

  if (isCoolingDown(fingerprint, now)) {
    return false
  }

  // RUM doesn't report the errors of the sessions it doesn't track
  if (!isSessionTracked()) {
    return false
  }

  if (refillCaptureBudget(now) <= 0) {
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

// Adds the budget earned since the last update, up to one second's worth, and returns the budget
function refillCaptureBudget(now: number): number {
  captureBudgetMs = Math.min(
    CAPTURE_BUDGET_MS_PER_SECOND,
    captureBudgetMs + ((now - captureBudgetUpdatedAt) * CAPTURE_BUDGET_MS_PER_SECOND) / 1000
  )
  captureBudgetUpdatedAt = now
  return captureBudgetMs
}

/**
 * Called when RUM assembles an error event. Prepares the snapshots captured for the exception, and
 * returns the attributes linking them to the event, or undefined if it has none. The snapshots are
 * only sent once RUM collects the event (see {@link sendExceptionReplay}).
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

    // The error was assembled before but RUM dropped it, and another exception with the same
    // fingerprint has been reported since
    if (exception.pendingSnapshots && isCoolingDown(exception.fingerprint, performance.now())) {
      exception.pendingSnapshots = undefined
      exception.attributes = null
    }

    if (exception.attributes === undefined) {
      exception.attributes = prepareSnapshots(error, exception)
    }
    return exception.attributes ?? undefined
  } catch (e) {
    monitorError(e)
  }
}

/**
 * Called when RUM collects an error event, once `beforeSend` and the event rate limits have let it
 * through. Sends the snapshots prepared for the exception, so errors that RUM drops send none.
 */
export function sendExceptionReplay(error: unknown): void {
  try {
    if (!isObject(error)) {
      return
    }

    const exception = capturedExceptions.get(error)
    if (!exception || !exception.pendingSnapshots) {
      return
    }

    const snapshots = exception.pendingSnapshots
    exception.pendingSnapshots = undefined
    for (const snapshot of snapshots) {
      queueExceptionSnapshot(snapshot)
    }
    recordReport(exception.fingerprint)
  } catch (e) {
    monitorError(e)
  }
}

function prepareSnapshots(error: object, exception: CapturedException): ExceptionReplayAttributes | null {
  const capturedFrames = exception.frames
  // Release the captures: the exception can't capture more frames once it's reported
  exception.frames = []

  // Another exception with the same fingerprint may have been reported since this one was captured
  if (isCoolingDown(exception.fingerprint, performance.now()) || !isDebuggerTransportInitialized()) {
    return null
  }

  const errorFrames = computeStackTrace(error).stack
  const exceptionId = generateUUID()
  const message = formatUnknownError(error)
  const throwable = formatThrowable(error)
  const frames: ExceptionReplayAttributes['frames'] = []
  const snapshots: ExceptionSnapshot[] = []

  let fromIndex = 0
  for (const frame of capturedFrames) {
    const callFrames = computeStackTrace(frame.callStack).stack
    const index = findFrameIndex(errorFrames, callFrames, fromIndex)
    if (index === undefined) {
      continue
    }

    const snapshotId = generateUUID()
    const separatorIndex = frame.functionId.lastIndexOf(';')
    snapshots.push({
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
    frames.push({ index, snapshotId })
    fromIndex = index + 1
  }

  if (frames.length === 0) {
    return null
  }

  exception.pendingSnapshots = snapshots
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
 * are compared. A function without callers has nothing to compare, so its frame in the error's stack
 * must also look like the same function.
 */
type StackFrame = StackTrace['stack'][number]

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
    if (callers.length > 0) {
      // A function with callers needs at least one of them in the error's stack to confirm the match
      if (comparedCount === 0) {
        continue
      }
    } else if (index !== errorFrames.length - 1 || !isSameFunction(errorFrames[index], functionFrame)) {
      // A function without callers is at the bottom of both stacks
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

// After an `await`, the stack shows a caller as an async frame located at the `await` instead of the
// call, as in `async main` (Chrome) or `async*main` (Firefox), so only its line can be compared.
const ASYNC_FRAME_PREFIX = /^async[ *]/

function isSameLocation(a: StackFrame, b: StackFrame): boolean {
  if (a.url !== b.url || a.line !== b.line) {
    return false
  }
  if (a.column === b.column) {
    return true
  }
  // Without the column, the line could hold several functions, as in a minified bundle
  const aName = getFunctionName(a)
  const bName = getFunctionName(b)
  return (isAsyncFrame(a) || isAsyncFrame(b)) && (aName === undefined || bName === undefined || aName === bName)
}

function isAsyncFrame(frame: StackFrame): boolean {
  return frame.func !== undefined && ASYNC_FRAME_PREFIX.test(frame.func)
}

// Compares function names, so a frame with a name and one without are from different functions.
// When neither has one, the frame from the error's stack must come first: it's where the function
// threw or called a callee, before reaching its catch block. Two unnamed functions of the same script
// can still be mistaken for each other.
function isSameFunction(errorFrame: StackFrame, functionFrame: StackFrame): boolean {
  const errorFunction = getFunctionName(errorFrame)
  const functionName = getFunctionName(functionFrame)
  if (errorFunction !== undefined || functionName !== undefined) {
    return errorFunction === functionName
  }
  return (
    errorFrame.line !== undefined &&
    functionFrame.line !== undefined &&
    (errorFrame.line < functionFrame.line ||
      (errorFrame.line === functionFrame.line && (errorFrame.column ?? 0) < (functionFrame.column ?? 0)))
  )
}

function getFunctionName(frame: StackFrame): string | undefined {
  const name = frame.func?.replace(ASYNC_FRAME_PREFIX, '')
  // `computeStackTrace` names unknown functions `?`
  return name && name !== '?' ? name : undefined
}

function isObject(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}
