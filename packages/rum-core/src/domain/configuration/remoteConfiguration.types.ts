/* eslint-disable */
/**
 * DO NOT MODIFY IT BY HAND. Run `yarn json-schemas:sync` instead.
 */

/**
 * RUM Browser & Mobile SDKs Remote Configuration properties
 */
export interface RumSdkConfig {
  /**
   * RUM feature Remote Configuration properties
   */
  rum?: {
    /**
     * UUID of the application
     */
    applicationId: string
    /**
     * The service name for this application
     */
    service?: string
    /**
     * The environment for this application
     */
    env?: string
    /**
     * The version for this application
     */
    version?: DynamicOption
    /**
     * The percentage of sessions tracked
     */
    sessionSampleRate?: number
    /**
     * The percentage of sessions with RUM & Session Replay pricing tracked
     */
    sessionReplaySampleRate?: number
    /**
     * Session replay default privacy level
     */
    defaultPrivacyLevel?: string
    /**
     * Privacy control for action name
     */
    enablePrivacyForActionName?: boolean
    /**
     * URLs where tracing is allowed
     */
    allowedTracingUrls?: {
      match: {
        /**
         * Remote config serialized type of match
         */
        rcSerializedType: 'string' | 'regex'
        /**
         * Match value
         */
        value: string
      }
      /**
       * List of propagator types
       */
      propagatorTypes: ('datadog' | 'b3' | 'b3multi' | 'tracecontext')[]
    }[]
    /**
     * Origins where tracking is allowed
     */
    allowedTrackingOrigins?: {
      /**
       * Remote config serialized type of match
       */
      rcSerializedType: 'string' | 'regex'
      /**
       * Match value
       */
      value: string
    }[]
    /**
     * The percentage of traces sampled
     */
    traceSampleRate?: number
    /**
     * Whether to track sessions across subdomains
     */
    trackSessionAcrossSubdomains?: boolean
    user?: {
      id?: DynamicOption
      name?: DynamicOption
      email?: DynamicOption
      additionals?: Array<{ key: string; value: DynamicOption }>
    }
    context?: {
      additionals: Array<{ key: string; value: DynamicOption }>
    }
  }
}

type DynamicOption = {
  rcSerializedType: 'dynamic'
  strategy: 'cookie'
  name: string
  extractor?: {
    rcSerializedType: 'regex'
    value: string
  }
}
