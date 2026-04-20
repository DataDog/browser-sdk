/**
 * DO NOT MODIFY IT BY HAND. Run `yarn json-schemas:sync` instead.
 */

/**
 * Schema of Browser SDK React Profiling types.
 */
export type ReactProfiling = ReactProfileEvent
/**
 * Schema for a React profiling session event, covering a time window of batched component render samples.
 */
export type ReactProfileEvent = ReactProfilingCommonProperties & {
  /**
   * ISO 8601 timestamp of when the profiling window started.
   */
  readonly start: string
  /**
   * ISO 8601 timestamp of when the profiling window ended.
   */
  readonly end: string
  /**
   * List of profile attachment filenames.
   */
  readonly attachments: 'react-profiling.json'[]
  [k: string]: unknown
}

/**
 * Schema of common properties for React profiling events.
 */
export interface ReactProfilingCommonProperties {
  /**
   * Application properties.
   */
  readonly application: {
    /**
     * Application ID.
     */
    readonly id: string
    [k: string]: unknown
  }
  /**
   * Session properties.
   */
  readonly session?: {
    /**
     * Session ID.
     */
    readonly id: string
    [k: string]: unknown
  }
  /**
   * View properties.
   */
  readonly view?: {
    /**
     * Array of view IDs seen during the profiling window.
     */
    readonly id: string[]
    /**
     * Array of view names seen during the profiling window.
     */
    readonly name: string[]
    [k: string]: unknown
  }
  [k: string]: unknown
}
