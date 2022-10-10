/* eslint-disable */
/**
 * DO NOT MODIFY IT BY HAND. Run `yarn rum-events-format:sync` instead.
 */

/**
 * Schema of all properties of a telemetry event
 */
export type TelemetryEvent = TelemetryErrorEvent | TelemetryDebugEvent | TelemetryConfigurationEvent
/**
 * Schema of all properties of a telemetry error event
 */
export type TelemetryErrorEvent = CommonTelemetryProperties & {
  /**
   * The telemetry log information
   */
  telemetry: {
    /**
     * Telemetry type
     */
    type?: 'log'
    /**
     * Level/severity of the log
     */
    status: 'error'
    /**
     * Body of the log
     */
    message: string
    /**
     * Error properties
     */
    error?: {
      /**
       * The stack trace or the complementary information about the error
       */
      stack?: string
      /**
       * The error type or kind (or code in some cases)
       */
      kind?: string
      [k: string]: unknown
    }
    [k: string]: unknown
  }
  [k: string]: unknown
}
/**
 * Schema of all properties of a telemetry debug event
 */
export type TelemetryDebugEvent = CommonTelemetryProperties & {
  /**
   * The telemetry log information
   */
  telemetry: {
    /**
     * Telemetry type
     */
    type?: 'log'
    /**
     * Level/severity of the log
     */
    status: 'debug'
    /**
     * Body of the log
     */
    message: string
    [k: string]: unknown
  }
  [k: string]: unknown
}
/**
 * Schema of all properties of a telemetry configuration event
 */
export type TelemetryConfigurationEvent = CommonTelemetryProperties & {
  /**
   * The telemetry configuration information
   */
  telemetry: {
    /**
     * Telemetry type
     */
    type: 'configuration'
    /**
     * Configuration properties
     */
    configuration: {
      /**
       * The percentage of sessions tracked
       */
      session_sample_rate?: number
      /**
       * The percentage of telemetry events sent
       */
      telemetry_sample_rate?: number
      /**
       * The percentage of requests traced
       */
      trace_sample_rate?: number
      /**
       * The percentage of sessions with Browser RUM & Session Replay pricing tracked (deprecated in favor of session_replay_sample_rate)
       */
      premium_sample_rate?: number
      /**
       * The percentage of sessions with Browser RUM & Session Replay pricing tracked (deprecated in favor of session_replay_sample_rate)
       */
      replay_sample_rate?: number
      /**
       * The percentage of sessions with Browser RUM & Session Replay pricing tracked
       */
      session_replay_sample_rate?: number
      /**
       * Whether a proxy configured is used
       */
      use_proxy?: boolean
      /**
       * Whether beforeSend callback function is used
       */
      use_before_send?: boolean
      /**
       * Whether initialization fails silently if the SDK is already initialized
       */
      silent_multiple_init?: boolean
      /**
       * Whether sessions across subdomains for the same site are tracked
       */
      track_session_across_subdomains?: boolean
      /**
       * Whether a secure cross-site session cookie is used
       */
      use_cross_site_session_cookie?: boolean
      /**
       * Whether a secure session cookie is used
       */
      use_secure_session_cookie?: boolean
      /**
       * Attribute to be used to name actions
       */
      action_name_attribute?: string
      /**
       * Whether the allowed tracing origins list is used
       */
      use_allowed_tracing_origins?: boolean
      /**
       * Session replay default privacy level
       */
      default_privacy_level?: string
      /**
       * Whether the request origins list to ignore when computing the page activity is used
       */
      use_excluded_activity_urls?: boolean
      /**
       * Whether user frustrations are tracked
       */
      track_frustrations?: boolean
      /**
       * Whether the RUM views creation is handled manually
       */
      track_views_manually?: boolean
      /**
       * Whether user actions are tracked
       */
      track_interactions?: boolean
      /**
       * Whether console.error logs, uncaught exceptions and network errors are tracked
       */
      forward_errors_to_logs?: boolean
      /**
       * The console.* tracked
       */
      forward_console_logs?: string[] | 'all'
      /**
       * The reports from the Reporting API tracked
       */
      forward_reports?: string[] | 'all'
      /**
       * Whether local encryption is used
       */
      use_local_encryption?: boolean
      /**
       * View tracking strategy
       */
      view_tracking_strategy?:
        | 'ActivityViewTrackingStrategy'
        | 'FragmentViewTrackingStrategy'
        | 'MixedViewTrackingStrategy'
        | 'NavigationViewTrackingStrategy'
      /**
       * Whether RUM events are tracked when the application is in Background
       */
      track_background_events?: boolean
      /**
       * The period between each Mobile Vital sample (in milliseconds)
       */
      mobile_vitals_update_period?: number
      /**
       * Whether native crashes are tracked
       */
      track_native_crashes?: boolean
      [k: string]: unknown
    }
    [k: string]: unknown
  }
  [k: string]: unknown
}

/**
 * Schema of common properties of Telemetry events
 */
export interface CommonTelemetryProperties {
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
  /**
   * Telemetry event type. Should specify telemetry only.
   */
  readonly type: 'telemetry'
  /**
   * Start of the event in ms from epoch
   */
  date: number
  /**
   * The SDK generating the telemetry event
   */
  service: string
  /**
   * The source of this event
   */
  readonly source: 'android' | 'ios' | 'browser' | 'flutter' | 'react-native'
  /**
   * The version of the SDK generating the telemetry event
   */
  version: string
  /**
   * Application properties
   */
  readonly application?: {
    /**
     * UUID of the application
     */
    id: string
    [k: string]: unknown
  }
  /**
   * Session properties
   */
  session?: {
    /**
     * UUID of the session
     */
    id: string
    [k: string]: unknown
  }
  /**
   * View properties
   */
  view?: {
    /**
     * UUID of the view
     */
    id: string
    [k: string]: unknown
  }
  /**
   * Action properties
   */
  action?: {
    /**
     * UUID of the action
     */
    id: string
    [k: string]: unknown
  }
  /**
   * Enabled experimental features
   */
  readonly experimental_features?: string[]
  [k: string]: unknown
}
