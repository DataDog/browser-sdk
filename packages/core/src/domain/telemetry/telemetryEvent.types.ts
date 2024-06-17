/* eslint-disable */
/**
 * DO NOT MODIFY IT BY HAND. Run `yarn rum-events-format:sync` instead.
 */

/**
 * Schema of all properties of a telemetry event
 */
export type TelemetryEvent =
  | TelemetryErrorEvent
  | TelemetryDebugEvent
  | TelemetryConfigurationEvent
  | TelemetryUsageEvent
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
       * The percentage of telemetry configuration events sent after being sampled by telemetry_sample_rate
       */
      telemetry_configuration_sample_rate?: number
      /**
       * The percentage of telemetry usage events sent after being sampled by telemetry_sample_rate
       */
      telemetry_usage_sample_rate?: number
      /**
       * The percentage of requests traced
       */
      trace_sample_rate?: number
      /**
       * The opt-in configuration to add trace context
       */
      trace_context_injection?: 'all' | 'sampled'
      /**
       * The percentage of sessions with Browser RUM & Session Replay pricing tracked (deprecated in favor of session_replay_sample_rate)
       */
      premium_sample_rate?: number
      /**
       * The percentage of sessions with Browser RUM & Session Replay pricing tracked (deprecated in favor of session_replay_sample_rate)
       */
      replay_sample_rate?: number
      /**
       * The percentage of sessions with RUM & Session Replay pricing tracked
       */
      session_replay_sample_rate?: number
      /**
       * The initial tracking consent value
       */
      tracking_consent?: 'granted' | 'not-granted' | 'pending'
      /**
       * Whether the session replay start is handled manually
       */
      start_session_replay_recording_manually?: boolean
      /**
       * Whether a proxy is used
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
       * Whether resources are tracked
       */
      track_resources?: boolean
      /**
       * Whether long tasks are tracked
       */
      track_long_task?: boolean
      /**
       * Whether a secure cross-site session cookie is used (deprecated)
       */
      use_cross_site_session_cookie?: boolean
      /**
       * Whether a partitioned secure cross-site session cookie is used
       */
      use_partitioned_cross_site_session_cookie?: boolean
      /**
       * Whether a secure session cookie is used
       */
      use_secure_session_cookie?: boolean
      /**
       * Whether it is allowed to use LocalStorage when cookies are not available
       */
      allow_fallback_to_local_storage?: boolean
      /**
       * Whether contexts are stored in local storage
       */
      store_contexts_across_pages?: boolean
      /**
       * Whether untrusted events are allowed
       */
      allow_untrusted_events?: boolean
      /**
       * Attribute to be used to name actions
       */
      action_name_attribute?: string
      /**
       * Whether the allowed tracing origins list is used (deprecated in favor of use_allowed_tracing_urls)
       */
      use_allowed_tracing_origins?: boolean
      /**
       * Whether the allowed tracing urls list is used
       */
      use_allowed_tracing_urls?: boolean
      /**
       * A list of selected tracing propagators
       */
      selected_tracing_propagators?: ('datadog' | 'b3' | 'b3multi' | 'tracecontext')[]
      /**
       * Session replay default privacy level
       */
      default_privacy_level?: string
      /**
       * Privacy control for action name
       */
      enable_privacy_for_action_name?: boolean
      /**
       * Whether the request origins list to ignore when computing the page activity is used
       */
      use_excluded_activity_urls?: boolean
      /**
       * Whether the Worker is loaded from an external URL
       */
      use_worker_url?: boolean
      /**
       * Whether intake requests are compressed
       */
      compress_intake_requests?: boolean
      /**
       * Whether user frustrations are tracked
       */
      track_frustrations?: boolean
      /**
       * Whether the RUM views creation is handled manually
       */
      track_views_manually?: boolean
      /**
       * Whether user actions are tracked (deprecated in favor of track_user_interactions)
       */
      track_interactions?: boolean
      /**
       * Whether user actions are tracked
       */
      track_user_interactions?: boolean
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
       * Whether error monitoring & crash reporting is enabled for the source platform
       */
      track_errors?: boolean
      /**
       * Whether automatic collection of network requests is enabled
       */
      track_network_requests?: boolean
      /**
       * Whether tracing features are enabled
       */
      use_tracing?: boolean
      /**
       * Whether native views are tracked (for cross platform SDKs)
       */
      track_native_views?: boolean
      /**
       * Whether native error monitoring & crash reporting is enabled (for cross platform SDKs)
       */
      track_native_errors?: boolean
      /**
       * Whether long task tracking is performed automatically
       */
      track_native_long_tasks?: boolean
      /**
       * Whether long task tracking is performed automatically for cross platform SDKs
       */
      track_cross_platform_long_tasks?: boolean
      /**
       * Whether the client has provided a list of first party hosts
       */
      use_first_party_hosts?: boolean
      /**
       * The type of initialization the SDK used, in case multiple are supported
       */
      initialization_type?: string
      /**
       * Whether Flutter build and raster time tracking is enabled
       */
      track_flutter_performance?: boolean
      /**
       * The window duration for batches sent by the SDK (in milliseconds)
       */
      batch_size?: number
      /**
       * The upload frequency of batches (in milliseconds)
       */
      batch_upload_frequency?: number
      /**
       * Maximum number of batches processed sequentially without a delay
       */
      batch_processing_level?: number
      /**
       * Whether UIApplication background tasks are enabled
       */
      background_tasks_enabled?: boolean
      /**
       * The version of React used in a ReactNative application
       */
      react_version?: string
      /**
       * The version of ReactNative used in a ReactNative application
       */
      react_native_version?: string
      /**
       * The version of Dart used in a Flutter application
       */
      dart_version?: string
      /**
       * The version of Unity used in a Unity application
       */
      unity_version?: string
      /**
       * The threshold used for iOS App Hangs monitoring (in milliseconds)
       */
      app_hang_threshold?: number
      /**
       * Whether logs are sent to the PCI-compliant intake
       */
      use_pci_intake?: boolean
      /**
       * The tracer API used by the SDK. Possible values: 'Datadog', 'OpenTelemetry', 'OpenTracing'
       */
      tracer_api?: string
      /**
       * The version of the tracer API used by the SDK. Eg. '0.1.0'
       */
      tracer_api_version?: string
      /**
       * Whether logs are sent after the session expiration
       */
      send_logs_after_session_expiration?: boolean
      /**
       * The list of plugins enabled
       */
      plugins?: {
        /**
         * The name of the plugin
         */
        name: string
        [k: string]: unknown
      }[]
      [k: string]: unknown
    }
    [k: string]: unknown
  }
  [k: string]: unknown
}
/**
 * Schema of all properties of a telemetry usage event
 */
export type TelemetryUsageEvent = CommonTelemetryProperties & {
  /**
   * The telemetry usage information
   */
  telemetry: {
    /**
     * Telemetry type
     */
    type: 'usage'
    usage: TelemetryCommonFeaturesUsage | TelemetryBrowserFeaturesUsage
    [k: string]: unknown
  }
  [k: string]: unknown
}
/**
 * Schema of features usage common across SDKs
 */
export type TelemetryCommonFeaturesUsage =
  | {
      /**
       * setTrackingConsent API
       */
      feature: 'set-tracking-consent'
      /**
       * The tracking consent value set by the user
       */
      tracking_consent: 'granted' | 'not-granted' | 'pending'
      [k: string]: unknown
    }
  | {
      /**
       * stopSession API
       */
      feature: 'stop-session'
      [k: string]: unknown
    }
  | {
      /**
       * startView API
       */
      feature: 'start-view'
      [k: string]: unknown
    }
  | {
      /**
       * addAction API
       */
      feature: 'add-action'
      [k: string]: unknown
    }
  | {
      /**
       * addError API
       */
      feature: 'add-error'
      [k: string]: unknown
    }
  | {
      /**
       * setGlobalContext, setGlobalContextProperty, addAttribute APIs
       */
      feature: 'set-global-context'
      [k: string]: unknown
    }
  | {
      /**
       * setUser, setUserProperty, setUserInfo APIs
       */
      feature: 'set-user'
      [k: string]: unknown
    }
  | {
      /**
       * addFeatureFlagEvaluation API
       */
      feature: 'add-feature-flag-evaluation'
      [k: string]: unknown
    }
/**
 * Schema of browser specific features usage
 */
export type TelemetryBrowserFeaturesUsage =
  | {
      /**
       * startSessionReplayRecording API
       */
      feature: 'start-session-replay-recording'
      /**
       * Whether the recording is allowed to start even on sessions sampled out of replay
       */
      is_forced?: boolean
      [k: string]: unknown
    }
  | {
      /**
       * startDurationVital API
       */
      feature: 'start-duration-vital'
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
  readonly source: 'android' | 'ios' | 'browser' | 'flutter' | 'react-native' | 'unity'
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
  telemetry?: {
    /**
     * Device properties
     */
    device?: {
      /**
       * Architecture of the device
       */
      architecture?: string
      /**
       * Brand of the device
       */
      brand?: string
      /**
       * Model of the device
       */
      model?: string
      [k: string]: unknown
    }
    /**
     * OS properties
     */
    os?: {
      /**
       * Build of the OS
       */
      build?: string
      /**
       * Name of the OS
       */
      name?: string
      /**
       * Version of the OS
       */
      version?: string
      [k: string]: unknown
    }
    [k: string]: unknown
  }
  [k: string]: unknown
}
