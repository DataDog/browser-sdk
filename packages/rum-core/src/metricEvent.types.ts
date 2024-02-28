/* eslint-disable */
/**
 * DO NOT MODIFY IT BY HAND. Run `yarn rum-events-format:sync` instead.
 */

/**
 * Schema of all properties of a Metric event
 */
export interface MetricEvent {
  /**
   * Start of the event in ms from epoch
   */
  readonly date: number
  /**
   * Metric event type.
   */
  readonly type: 'metric'
  /**
   * Metric series properties
   */
  readonly metric: {
    /**
     * Type of the metric submission
     */
    readonly type: 'series'
    /**
     * A list of timeseries to submit to Datadog.
     */
    series: {
      /**
       * The name of the timeseries.
       */
      readonly metric: string
      /**
       * Points relating to a metric. All points must be objects with timestamp and a scalar value (cannot be a string). Timestamps should be in POSIX time in seconds, and cannot be more than ten minutes in the future or more than one hour in the past.
       */
      points: {
        /**
         * The timestamp should be in seconds and current. Current is defined as not more than 10 minutes in the future or more than 1 hour in the past.
         */
        readonly timestamp: number
        /**
         * The numeric value format should be a 64bit float gauge-type value.
         */
        readonly value: number
        [k: string]: unknown
      }[]
      /**
       * A list of tags associated with the metric.
       */
      tags?: string[]
      /**
       * The type of metric. The available types are 0 (unspecified), 1 (count), 2 (rate), and 3 (gauge).
       */
      readonly type?: 0 | 1 | 2 | 3
      [k: string]: unknown
    }[]
    [k: string]: unknown
  }
  /**
   * Internal properties
   */
  _dd: {
    /**
     * Version of the RUM event format
     */
    readonly format_version: 2
    [k: string]: unknown
  }
  [k: string]: unknown
}
