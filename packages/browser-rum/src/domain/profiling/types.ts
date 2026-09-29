import type { Profiler } from '@datadog/js-core/util'
import type { ClocksState } from '@datadog/js-core/time'
import type { TimeoutId } from '@datadog/browser-core'
import type { BrowserProfileEvent, BrowserProfilerTrace, RumViewEntry } from '../../types'
import type { LongTaskContext } from './longTaskHistory'

/**
 * Additional data recorded during profiling session
 */
export interface RumProfilerEnrichmentData {
  /** List of detected long tasks */
  readonly longTasks: LongTaskContext[]
  /** List of detected navigation entries */
  readonly views: RumViewEntry[]
}

/**
 * Describes profiler session state when it's stopped
 */
export interface RumProfilerStoppedInstance {
  readonly state: 'stopped'
  readonly stateReason: 'session-expired' | 'stopped-by-user' | 'initializing' | 'quota_ko'
}

/**
 * Describes profiler session state when it's paused
 * (this happens when user focuses on a different tab)
 */
export interface RumProfilerPausedInstance {
  readonly state: 'paused'
}

/**
 * Describes profiler session state when it's running
 */
export interface RumProfilerRunningInstance extends RumProfilerEnrichmentData {
  readonly state: 'running'
  /** Current profiler instance */
  readonly profiler: Profiler
  /** High resolution time when profiler session started */
  readonly startClocks: ClocksState
  /** Timeout id to stop current session */
  readonly timeoutId: TimeoutId
  /** Clean-up tasks to execute after running the Profiler */
  readonly cleanupTasks: Array<() => void>
  /** Session ID */
  readonly sessionId: string | undefined
}

export type RumProfilerInstance = RumProfilerStoppedInstance | RumProfilerPausedInstance | RumProfilerRunningInstance

export interface RUMProfiler {
  start: () => void
  stop: () => void
  isStopped: () => boolean
  isRunning: () => boolean
  isPaused: () => boolean
}

export interface ProfilingPayload {
  profile: BrowserProfileEvent
  trace: BrowserProfilerTrace
}

/**
 * Reason why starting a Profiler instance failed.
 * Values match the `error_reason` values of the profiling internal context.
 */
export type ProfilerStartupErrorReason =
  'not-supported-by-browser' | 'missing-document-policy-header' | 'unexpected-exception'

/**
 * A Profiler instance started by the early profiler snippet, along with the
 * time it started, so the profiler chunk can adopt it and keep the samples
 * collected while it was downloading.
 */
export interface EarlyProfilerTakeover {
  /** The running Profiler instance to adopt. */
  readonly profiler: Profiler
  /** High resolution time when the Profiler instance started. */
  readonly startClocks: ClocksState
}

export interface RUMProfilerConfiguration {
  sampleIntervalMs: number // Sample stack trace every x milliseconds (defaults to 10ms for Unix, 16ms on Windows)
  collectIntervalMs: number // Interval for collecting RUM Profiles (defaults to 1min)
  minProfileDurationMs: number // Minimum duration of a profile for it be sent (defaults to 5s). Profiles shorter than this duration are discarded.
}
