/* eslint-disable */
/**
 * DO NOT MODIFY IT BY HAND. Run `yarn json-schemas:sync` instead.
 */

export type MatchOption =
  | {
      /**
       * string type
       */
      rcSerializedType: 'string'
      /**
       * string value
       */
      value: string
    }
  | SerializedRegex
export type DynamicOption =
  | {
      rcSerializedType: 'dynamic'
      strategy: 'js'
      path: string
      extractor?: SerializedRegex
    }
  | {
      rcSerializedType: 'dynamic'
      strategy: 'cookie'
      name: string
      extractor?: SerializedRegex
    }
  | {
      rcSerializedType: 'dynamic'
      strategy: 'dom'
      selector: string
      attribute?: string
      extractor?: SerializedRegex
    }

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
    version?:
      | {
          rcSerializedType: 'dynamic'
          strategy: 'js'
          path: string
          extractor?: SerializedRegex
        }
      | {
          rcSerializedType: 'dynamic'
          strategy: 'cookie'
          name: string
          extractor?: SerializedRegex
        }
      | {
          rcSerializedType: 'dynamic'
          strategy: 'dom'
          selector: string
          attribute?: string
          extractor?: SerializedRegex
        }
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
      match: MatchOption
      /**
       * List of propagator types
       */
      propagatorTypes?: ('datadog' | 'b3' | 'b3multi' | 'tracecontext')[] | null
    }[]
    /**
     * Origins where tracking is allowed
     */
    allowedTrackingOrigins?: MatchOption[]
    /**
     * The percentage of traces sampled
     */
    traceSampleRate?: number
    /**
     * Whether to track sessions across subdomains
     */
    trackSessionAcrossSubdomains?: boolean
    user?: ContextItem[]
    context?: ContextItem[]
  }
}
export interface SerializedRegex {
  /**
   * regex type
   */
  rcSerializedType: 'regex'
  /**
   * regex pattern
   */
  value: string
}
export interface ContextItem {
  key: string
  value: DynamicOption
}
