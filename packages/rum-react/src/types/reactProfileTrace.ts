/**
 * DO NOT MODIFY IT BY HAND. Run `yarn json-schemas:sync` instead.
 */

/**
 * Trace attachment for a React profiling session. Contains render samples grouped by React commit batch.
 */
export interface ReactProfileTrace {
  /**
   * Render samples, one per React commit batch.
   */
  readonly samples: {
    /**
     * ISO 8601 timestamp of the earliest render in this batch.
     */
    readonly timestamp: string
    /**
     * Component renders that occurred in this commit batch.
     */
    readonly renders: {
      /**
       * Name of the React component being profiled.
       */
      readonly component: string
      /**
       * React render phase.
       */
      readonly phase: 'mount' | 'update' | 'nested-update'
      /**
       * Total render duration in nanoseconds, including all lifecycle phases.
       */
      readonly duration: number
      /**
       * Time spent in the render phase in nanoseconds. Only present in standard mode.
       */
      readonly render_phase_duration?: number
      /**
       * Time spent in useLayoutEffect in nanoseconds. Only present in standard mode.
       */
      readonly layout_effect_phase_duration?: number
      /**
       * Time spent in useEffect in nanoseconds. Only present in standard mode.
       */
      readonly effect_phase_duration?: number
      /**
       * Estimated time to re-render the subtree from scratch in nanoseconds. Only present when using react-dom/profiling build.
       */
      readonly base_duration?: number
      [k: string]: unknown
    }[]
    [k: string]: unknown
  }[]
  [k: string]: unknown
}
