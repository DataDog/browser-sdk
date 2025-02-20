import type { EndpointBuilder, HttpResponse, TimeoutId } from '@datadog/browser-core'
import type { LifeCycle } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import type { RumSessionManager } from '../../rumSessionManager'
import type { ProfilerTrace, Profiler } from './profilerApi.types'

/**
 * Configuration based on init options (with resolved defaults)
 */
export interface RumProfilerConfig {
  configuration: RumConfiguration
  endpointBuilder: EndpointBuilder
  isLongAnimationFrameEnabled: boolean | undefined
  lifeCycle: LifeCycle
  session: RumSessionManager
}

export interface RumNavigationEntry {
  /** Detected start time of navigation */
  readonly startTime: DOMHighResTimeStamp
  /** RUM view id */
  readonly viewId: string
}

/**
 * Additional data recorded during profiling session
 */
export interface RumProfilerEnrichmentData {
  /** List of detected long tasks */
  readonly longTasks: PerformanceEntry[]
  /** List of detected measures */
  readonly measures: PerformanceMeasure[]
  /** List of detected events */
  readonly events: PerformanceEventTiming[]
  /** List of detected navigation entries */
  readonly navigation: RumNavigationEntry[]
}

export interface RumProfilerTrace extends ProfilerTrace, RumProfilerEnrichmentData {
  /** High resolution time when profiler trace started, relative to the profiling session's time origin */
  readonly startTime: DOMHighResTimeStamp
  /** High resolution time when profiler trace ended, relative to the profiling session's time origin */
  readonly endTime: DOMHighResTimeStamp
  /** Time origin of the profiling session */
  readonly timeOrigin: number
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
  readonly startTime: DOMHighResTimeStamp
  /** Timeout id to stop current session */
  readonly timeoutId: TimeoutId
}

export type RumProfilerInstance = RumProfilerStoppedInstance | RumProfilerPausedInstance | RumProfilerRunningInstance

/**
 * Interface for exporting profiler traces.
 */
export type RumProfilerTraceExporter = (
  trace: RumProfilerTrace,
  endpointBuilder: EndpointBuilder,
  applicationId: string,
  sessionId: string | undefined,
  site: string | undefined
) => Promise<HttpResponse>
