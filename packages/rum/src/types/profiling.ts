/* eslint-disable */
/**
 * DO NOT MODIFY IT BY HAND. Run `yarn json-schemas:sync` instead.
 */

/**
 * Schema of Browser SDK Profiling types.
 */
export type BrowserProfiling = BrowserProfileEvent | BrowserProfilerTrace
/**
 * Schema of the Browser SDK Profile Event payload.
 */
export type BrowserProfileEvent = ProfileCommonProperties & {
  /**
   * Profile data format.
   */
  readonly format: 'json'
  /**
   * Datadog internal metadata.
   */
  readonly _dd: {
    /**
     * Clock drift value. Used by Browser SDK.
     */
    readonly clock_drift: number
  }
  /**
   * Action properties.
   */
  readonly action?: {
    /**
     * Array of action IDs.
     */
    readonly id: string[]
    /**
     * Array of action labels.
     */
    readonly label: string[]
  }
  /**
   * Vital properties.
   */
  readonly vital?: {
    /**
     * Array of vital IDs.
     */
    readonly id: string[]
    /**
     * Array of vital labels.
     */
    readonly label: string[]
  }
}

/**
 * Schema of a Profile Event metadata. Contains attributes shared by all profiles.
 */
export interface ProfileCommonProperties {
  /**
   * Application properties.
   */
  readonly application: {
    /**
     * Application ID.
     */
    readonly id: string
  }
  /**
   * Session properties.
   */
  readonly session?: {
    /**
     * Session ID.
     */
    readonly id: string
  }
  /**
   * View properties.
   */
  readonly view?: {
    /**
     * Array of view IDs.
     */
    readonly id: string[]
    /**
     * Array of view names.
     */
    readonly name: string[]
  }
  /**
   * Long task properties.
   */
  readonly long_task?: {
    /**
     * Array of long task IDs.
     */
    readonly id: string[]
  }
  /**
   * List of attachment filenames.
   */
  readonly attachments: string[]
  /**
   * Start time as ISO 8601 date string (yyyy-MM-dd'T'HH:mm:ss.SSS'Z').
   */
  readonly start: string
  /**
   * End time marking when the profile ended, as ISO 8601 date string (yyyy-MM-dd'T'HH:mm:ss.SSS'Z').
   */
  readonly end: string
  /**
   * Profiler family.
   */
  readonly family: 'android' | 'chrome' | 'ios'
  /**
   * Runtime environment.
   */
  readonly runtime: 'android' | 'chrome' | 'ios'
  /**
   * Profile ingestion event version.
   */
  readonly version: number
  /**
   * Comma-separated profiler tags.
   */
  readonly tags_profiler: string
}
/**
 * Schema of a RUM profiler trace containing profiling data enriched with RUM context.
 */
export interface BrowserProfilerTrace {
  /**
   * An array of profiler resources.
   */
  readonly resources: string[]
  /**
   * An array of profiler frames.
   */
  readonly frames: ProfilerFrame[]
  /**
   * An array of profiler stacks.
   */
  readonly stacks: ProfilerStack[]
  /**
   * An array of profiler samples.
   */
  readonly samples: ProfilerSample[]
  startClocks: ClocksState
  endClocks: ClocksState
  clocksOrigin: ClocksState
  /**
   * Sample interval in milliseconds.
   */
  readonly sampleInterval: number
  /**
   * List of detected long tasks.
   */
  readonly longTasks: RumProfilerLongTaskEntry[]
  /**
   * List of detected vital entries.
   */
  readonly vitals?: RumProfilerVitalEntry[]
  /**
   * List of detected action entries.
   */
  readonly actions?: RumProfilerActionEntry[]
  /**
   * List of detected navigation entries.
   */
  readonly views: RumViewEntry[]
}
/**
 * Schema of a profiler frame from the JS Self-Profiling API.
 */
export interface ProfilerFrame {
  /**
   * A function instance name.
   */
  readonly name: string
  /**
   * Index in the trace.resources array.
   */
  readonly resourceId?: number
  /**
   * 1-based index of the line.
   */
  readonly line?: number
  /**
   * 1-based index of the column.
   */
  readonly column?: number
}
/**
 * Schema of a profiler stack from the JS Self-Profiling API.
 */
export interface ProfilerStack {
  /**
   * Index in the trace.stacks array.
   */
  readonly parentId?: number
  /**
   * Index in the trace.frames array.
   */
  readonly frameId: number
}
/**
 * Schema of a profiler sample from the JS Self-Profiling API.
 */
export interface ProfilerSample {
  /**
   * High resolution time relative to the profiling session's time origin.
   */
  readonly timestamp: number
  /**
   * Index in the trace.stacks array.
   */
  readonly stackId?: number
}
/**
 * Schema of timing state with both relative and absolute timestamps.
 */
export interface ClocksState {
  /**
   * Time relative to navigation start in milliseconds.
   */
  readonly relative: number
  /**
   * Epoch time in milliseconds.
   */
  readonly timeStamp: number
}
/**
 * Schema of a long task entry recorded during profiling.
 */
export interface RumProfilerLongTaskEntry {
  /**
   * RUM Long Task id.
   */
  readonly id?: string
  /**
   * Duration in ms of the long task or long animation frame.
   */
  readonly duration: number
  /**
   * Type of the event: long task or long animation frame
   */
  readonly entryType: 'longtask' | 'long-animation-frame'
  startClocks: ClocksState
}
/**
 * Schema of a vital entry recorded during profiling.
 */
export interface RumProfilerVitalEntry {
  /**
   * RUM Vital id.
   */
  readonly id: string
  /**
   * RUM Vital label.
   */
  readonly label: string
  /**
   * Duration in ms of the vital.
   */
  readonly duration?: number
  startClocks: ClocksState
}
/**
 * Schema of a action entry recorded during profiling.
 */
export interface RumProfilerActionEntry {
  /**
   * RUM Action id.
   */
  readonly id: string
  /**
   * RUM Action label.
   */
  readonly label: string
  /**
   * Duration in ms of the duration vital.
   */
  readonly duration?: number
  startClocks: ClocksState
}
/**
 * Schema of a RUM view entry recorded during profiling.
 */
export interface RumViewEntry {
  startClocks: ClocksState
  /**
   * RUM view id.
   */
  readonly viewId: string
  /**
   * RUM view name.
   */
  readonly viewName?: string
}
