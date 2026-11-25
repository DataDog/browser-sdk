import type { TimeoutId } from '@datadog/js-core/util'
import type { BrowserProfiler } from '../../browser/browserProfiler'
import type { BrowserProfileEvent, BrowserProfilerTrace } from '../../types'

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
export interface RumProfilerRunningInstance {
  readonly state: 'running'
  /** Current profiler instance */
  readonly browserProfiler: BrowserProfiler
  /** Timeout id to stop current session */
  readonly timeoutId: TimeoutId
  /** Session ID */
  readonly sessionId: string | undefined
}

export type RumProfilerInstance = RumProfilerStoppedInstance | RumProfilerPausedInstance | RumProfilerRunningInstance

export interface RUMProfiler {
  start: (browserProfiler?: BrowserProfiler) => void
  stop: () => void
  isStopped: () => boolean
  isRunning: () => boolean
  isPaused: () => boolean
}

export interface ProfilingPayload {
  profile: BrowserProfileEvent
  trace: BrowserProfilerTrace
}

export interface RUMProfilerConfiguration {
  sampleIntervalMs: number // Sample stack trace every x milliseconds (defaults to 10ms for Unix, 16ms on Windows)
  collectIntervalMs: number // Interval for collecting RUM Profiles (defaults to 1min)
  minProfileDurationMs: number // Minimum duration of a profile for it be sent (defaults to 5s). Profiles shorter than this duration are discarded.
}
