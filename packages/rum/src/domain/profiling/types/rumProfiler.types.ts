import type { TimeoutId, ClocksState } from '@datadog/browser-core'
import type { RumViewEntry } from '../../../types'
import type { LongTaskContext } from '../longTaskHistory'
import type { Profiler } from './profilerApi.types'

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
  readonly stateReason: 'session-expired' | 'stopped-by-user' | 'initializing'
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
}

export type RumProfilerInstance = RumProfilerStoppedInstance | RumProfilerPausedInstance | RumProfilerRunningInstance

export interface RUMProfiler {
  start: () => void
  stop: () => void
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
