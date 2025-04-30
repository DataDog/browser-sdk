import type { TimeoutId, RelativeTime, ClocksState, Duration } from '@datadog/browser-core'
import type { ViewHistoryEntry } from '@datadog/browser-rum-core'
import type { ProfilerTrace, Profiler } from './profilerApi.types'

export interface RumViewEntry {
  /** Detected start time of view */
  readonly startClocks: ClocksState
  /** RUM view id */
  readonly viewId: string
  /** RUM view name */
  readonly viewName: string | undefined
}

export interface RUMProfilerLongTaskEntry {
  /** RUM Long Task id */
  readonly id: string | undefined
  /** RUM Long Task duration */
  readonly duration: Duration
  /** RUM Long Task entry type */
  readonly entryType: string
  /** RUM Long Task start time */
  readonly startClocks: ClocksState
}

/**
 * Additional data recorded during profiling session
 */
export interface RumProfilerEnrichmentData {
  /** List of detected long tasks */
  readonly longTasks: RUMProfilerLongTaskEntry[]
  /** List of detected navigation entries */
  readonly views: RumViewEntry[]
}

export interface RumProfilerTrace extends ProfilerTrace, RumProfilerEnrichmentData {
  /** High resolution time when profiler trace started, relative to the profiling session's time origin */
  readonly startClocks: ClocksState
  /** High resolution time when profiler trace ended, relative to the profiling session's time origin */
  readonly endClocks: ClocksState
  /** Time origin of the profiling session */
  readonly clocksOrigin: ClocksState
  /** Sample interval in milliseconds */
  readonly sampleInterval: number
}

/**
 * Describes profiler session state when it's stopped
 */
export interface RumProfilerStoppedInstance {
  readonly state: 'stopped'
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
  /** Performance observer to detect long tasks */
  readonly observer: PerformanceObserver | undefined
}

export type RumProfilerInstance = RumProfilerStoppedInstance | RumProfilerPausedInstance | RumProfilerRunningInstance

export interface RUMProfiler {
  start: (viewEntry: ViewHistoryEntry | undefined) => void
  stop: () => Promise<void>
  isStopped: () => boolean
  isRunning: () => boolean
  isPaused: () => boolean
}

export interface RUMProfilerConfiguration {
  sampleIntervalMs: number // Sample stack trace every x milliseconds (defaults to 10ms for Unix, 16ms on Windows)
  collectIntervalMs: number // Interval for collecting RUM Profiles (defaults to 1min)
  minProfileDurationMs: number // Minimum duration of a profile for it be sent (defaults to 5s). Profiles shorter than this duration are discarded.
  minNumberOfSamples: number // Minimum number of samples to be collected before it can be sent (defaults to 50). Profiles with fewer samples are discarded.
}
