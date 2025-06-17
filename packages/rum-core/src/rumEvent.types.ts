/* eslint-disable */
/**
 * DO NOT MODIFY IT BY HAND. Run `yarn rum-events-format:sync` instead.
 */

/**
 * Schema of all properties of a RUM event
 */
export type RumEvent =
  | RumActionEvent
  | RumErrorEvent
  | RumLongTaskEvent
  | RumResourceEvent
  | RumViewEvent
  | RumVitalEvent
/**
 * Schema of all properties of an Action event
 */
export type RumActionEvent = CommonProperties &
  ViewContainerSchema & {
    /**
     * RUM event type
     */
    readonly type: 'action'
    /**
     * Action properties
     */
    readonly action: {
      /**
       * Type of the action
       */
      readonly type: 'custom' | 'click' | 'tap' | 'scroll' | 'swipe' | 'application_start' | 'back'
      /**
       * UUID of the action
       */
      readonly id?: string
      /**
       * Duration in ns to the action is considered loaded
       */
      readonly loading_time?: number
      /**
       * Action target properties
       */
      readonly target?: {
        /**
         * Target name
         */
        name: string
        [k: string]: unknown
      }
      /**
       * Action frustration properties
       */
      readonly frustration?: {
        /**
         * Action frustration types
         */
        readonly type: ('rage_click' | 'dead_click' | 'error_click' | 'rage_tap' | 'error_tap')[]
        [k: string]: unknown
      }
      /**
       * Properties of the errors of the action
       */
      readonly error?: {
        /**
         * Number of errors that occurred on the action
         */
        readonly count: number
        [k: string]: unknown
      }
      /**
       * Properties of the crashes of the action
       */
      readonly crash?: {
        /**
         * Number of crashes that occurred on the action
         */
        readonly count: number
        [k: string]: unknown
      }
      /**
       * Properties of the long tasks of the action
       */
      readonly long_task?: {
        /**
         * Number of long tasks that occurred on the action
         */
        readonly count: number
        [k: string]: unknown
      }
      /**
       * Properties of the resources of the action
       */
      readonly resource?: {
        /**
         * Number of resources that occurred on the action
         */
        readonly count: number
        [k: string]: unknown
      }
      [k: string]: unknown
    }
    /**
     * View properties
     */
    readonly view?: {
      /**
       * Is the action starting in the foreground (focus in browser)
       */
      readonly in_foreground?: boolean
      [k: string]: unknown
    }
    /**
     * Internal properties
     */
    _dd?: {
      /**
       * Action properties
       */
      readonly action?: {
        /**
         * Action position properties
         */
        readonly position?: {
          /**
           * X coordinate relative to the target element of the action (in pixels)
           */
          readonly x: number
          /**
           * Y coordinate relative to the target element of the action (in pixels)
           */
          readonly y: number
          [k: string]: unknown
        }
        /**
         * Target properties
         */
        target?: {
          /**
           * CSS selector path of the target element
           */
          readonly selector?: string
          /**
           * Width of the target element (in pixels)
           */
          readonly width?: number
          /**
           * Height of the target element (in pixels)
           */
          readonly height?: number
          [k: string]: unknown
        }
        /**
         * The strategy of how the auto click action name is computed
         */
        name_source?:
          | 'custom_attribute'
          | 'mask_placeholder'
          | 'standard_attribute'
          | 'text_content'
          | 'mask_disallowed'
          | 'blank'
        [k: string]: unknown
      }
      [k: string]: unknown
    }
    [k: string]: unknown
  }
/**
 * Schema of all properties of an Error event
 */
export type RumErrorEvent = CommonProperties &
  ActionChildProperties &
  ViewContainerSchema & {
    /**
     * RUM event type
     */
    readonly type: 'error'
    /**
     * Error properties
     */
    readonly error: {
      /**
       * UUID of the error
       */
      readonly id?: string
      /**
       * Error message
       */
      message: string
      /**
       * Source of the error
       */
      readonly source: 'network' | 'source' | 'console' | 'logger' | 'agent' | 'webview' | 'custom' | 'report'
      /**
       * Stacktrace of the error
       */
      stack?: string
      /**
       * Causes of the error
       */
      causes?: {
        /**
         * Error message
         */
        message: string
        /**
         * The type of the error
         */
        readonly type?: string
        /**
         * Stacktrace of the error
         */
        stack?: string
        /**
         * Source of the error
         */
        readonly source: 'network' | 'source' | 'console' | 'logger' | 'agent' | 'webview' | 'custom' | 'report'
        [k: string]: unknown
      }[]
      /**
       * Whether this error crashed the host application
       */
      readonly is_crash?: boolean
      /**
       * Fingerprint used for Error Tracking custom grouping
       */
      fingerprint?: string
      /**
       * The type of the error
       */
      readonly type?: string
      /**
       * The specific category of the error. It provides a high-level grouping for different types of errors.
       */
      readonly category?: 'ANR' | 'App Hang' | 'Exception' | 'Watchdog Termination' | 'Memory Warning' | 'Network'
      /**
       * Whether the error has been handled manually in the source code or not
       */
      readonly handling?: 'handled' | 'unhandled'
      /**
       * Handling call stack
       */
      readonly handling_stack?: string
      /**
       * Source type of the error (the language or platform impacting the error stacktrace format)
       */
      readonly source_type?:
        | 'android'
        | 'browser'
        | 'ios'
        | 'react-native'
        | 'flutter'
        | 'roku'
        | 'ndk'
        | 'ios+il2cpp'
        | 'ndk+il2cpp'
      /**
       * Resource properties of the error
       */
      readonly resource?: {
        /**
         * HTTP method of the resource
         */
        readonly method: 'POST' | 'GET' | 'HEAD' | 'PUT' | 'DELETE' | 'PATCH' | 'TRACE' | 'OPTIONS' | 'CONNECT'
        /**
         * HTTP Status code of the resource
         */
        readonly status_code: number
        /**
         * URL of the resource
         */
        url: string
        /**
         * The provider for this resource
         */
        readonly provider?: {
          /**
           * The domain name of the provider
           */
          readonly domain?: string
          /**
           * The user friendly name of the provider
           */
          readonly name?: string
          /**
           * The type of provider
           */
          readonly type?:
            | 'ad'
            | 'advertising'
            | 'analytics'
            | 'cdn'
            | 'content'
            | 'customer-success'
            | 'first party'
            | 'hosting'
            | 'marketing'
            | 'other'
            | 'social'
            | 'tag-manager'
            | 'utility'
            | 'video'
          [k: string]: unknown
        }
        [k: string]: unknown
      }
      /**
       * Description of each thread in the process when error happened.
       */
      threads?: {
        /**
         * Name of the thread (e.g. 'Thread 0').
         */
        readonly name: string
        /**
         * Tells if the thread crashed.
         */
        readonly crashed: boolean
        /**
         * Unsymbolicated stack trace of the given thread.
         */
        readonly stack: string
        /**
         * Platform-specific state of the thread when its state was captured (CPU registers dump for iOS, thread state enum for Android, etc.).
         */
        readonly state?: string
        [k: string]: unknown
      }[]
      /**
       * Description of each binary image (native libraries; for Android: .so files) loaded or referenced by the process/application.
       */
      readonly binary_images?: {
        /**
         * Build UUID that uniquely identifies the binary image.
         */
        readonly uuid: string
        /**
         * Name of the library.
         */
        readonly name: string
        /**
         * Determines if it's a system or user library.
         */
        readonly is_system: boolean
        /**
         * Library's load address (hexadecimal).
         */
        readonly load_address?: string
        /**
         * Max value from the library address range (hexadecimal).
         */
        readonly max_address?: string
        /**
         * CPU architecture from the library.
         */
        readonly arch?: string
        [k: string]: unknown
      }[]
      /**
       * A boolean value saying if any of the stack traces was truncated due to minification.
       */
      readonly was_truncated?: boolean
      /**
       * Platform-specific metadata of the error event.
       */
      readonly meta?: {
        /**
         * The CPU architecture of the process that crashed.
         */
        readonly code_type?: string
        /**
         * Parent process information.
         */
        readonly parent_process?: string
        /**
         * A client-generated 16-byte UUID of the incident.
         */
        readonly incident_identifier?: string
        /**
         * The name of the crashed process.
         */
        readonly process?: string
        /**
         * The name of the corresponding BSD termination signal. (in case of iOS crash)
         */
        readonly exception_type?: string
        /**
         * CPU specific information about the exception encoded into 64-bit hexadecimal number preceded by the signal code.
         */
        readonly exception_codes?: string
        /**
         * The location of the executable.
         */
        readonly path?: string
        [k: string]: unknown
      }
      /**
       * Content Security Violation properties
       */
      readonly csp?: {
        /**
         * In the context of CSP errors, indicates how the violated policy is configured to be treated by the user agent.
         */
        readonly disposition?: 'enforce' | 'report'
        [k: string]: unknown
      }
      /**
       * Time since application start when error happened (in milliseconds)
       */
      readonly time_since_app_start?: number
      [k: string]: unknown
    }
    /**
     * Properties of App Hang and ANR errors
     */
    readonly freeze?: {
      /**
       * Duration of the main thread freeze (in ns)
       */
      readonly duration: number
      [k: string]: unknown
    }
    /**
     * View properties
     */
    readonly view?: {
      /**
       * Is the error starting in the foreground (focus in browser)
       */
      readonly in_foreground?: boolean
      [k: string]: unknown
    }
    /**
     * Feature flags properties
     */
    readonly feature_flags?: {
      [k: string]: unknown
    }
    [k: string]: unknown
  }
/**
 * Schema of all properties of a Long Task event
 */
export type RumLongTaskEvent = CommonProperties &
  ActionChildProperties &
  ViewContainerSchema & {
    /**
     * RUM event type
     */
    readonly type: 'long_task'
    /**
     * Long Task properties
     */
    readonly long_task: {
      /**
       * UUID of the long task or long animation frame
       */
      readonly id?: string
      /**
       * Start time of the long animation frame
       */
      readonly start_time?: number
      /**
       * Type of the event: long task or long animation frame
       */
      readonly entry_type?: 'long-task' | 'long-animation-frame'
      /**
       * Duration in ns of the long task or long animation frame
       */
      readonly duration: number
      /**
       * Duration in ns for which the animation frame was being blocked
       */
      readonly blocking_duration?: number
      /**
       * Start time of the rendering cycle, which includes requestAnimationFrame callbacks, style and layout calculation, resize observer and intersection observer callbacks
       */
      readonly render_start?: number
      /**
       * Start time of the time period spent in style and layout calculations
       */
      readonly style_and_layout_start?: number
      /**
       * Start time of of the first UI event (mouse/keyboard and so on) to be handled during the course of this frame
       */
      readonly first_ui_event_timestamp?: number
      /**
       * Whether this long task is considered a frozen frame
       */
      readonly is_frozen_frame?: boolean
      /**
       * A list of long scripts that were executed over the course of the long frame
       */
      readonly scripts?: {
        /**
         * Duration in ns between startTime and when the subsequent microtask queue has finished processing
         */
        readonly duration?: number
        /**
         * Duration in ns of the total time spent in 'pausing' synchronous operations (alert, synchronous XHR)
         */
        readonly pause_duration?: number
        /**
         * Duration in ns of the the total time spent processing forced layout and style inside this function
         */
        readonly forced_style_and_layout_duration?: number
        /**
         * Time the entry function was invoked
         */
        readonly start_time?: number
        /**
         * Time after compilation
         */
        readonly execution_start?: number
        /**
         * The script resource name where available (or empty if not found)
         */
        source_url?: string
        /**
         * The script function name where available (or empty if not found)
         */
        readonly source_function_name?: string
        /**
         * The script character position where available (or -1 if not found)
         */
        readonly source_char_position?: number
        /**
         * Information about the invoker of the script
         */
        invoker?: string
        /**
         * Type of the invoker of the script
         */
        readonly invoker_type?:
          | 'user-callback'
          | 'event-listener'
          | 'resolve-promise'
          | 'reject-promise'
          | 'classic-script'
          | 'module-script'
        /**
         * The container (the top-level document, or an <iframe>) the long animation frame occurred in
         */
        readonly window_attribution?: string
        [k: string]: unknown
      }[]
      [k: string]: unknown
    }
    /**
     * Internal properties
     */
    readonly _dd?: {
      /**
       * Whether the long task should be discarded or indexed
       */
      readonly discarded?: boolean
      /**
       * Profiling context
       */
      profiling?: ProfilingInternalContextSchema
      [k: string]: unknown
    }
    [k: string]: unknown
  }
/**
 * Schema of all properties of a Resource event
 */
export type RumResourceEvent = CommonProperties &
  ActionChildProperties &
  ViewContainerSchema & {
    /**
     * RUM event type
     */
    readonly type: 'resource'
    /**
     * Resource properties
     */
    readonly resource: {
      /**
       * UUID of the resource
       */
      readonly id?: string
      /**
       * Resource type
       */
      readonly type:
        | 'document'
        | 'xhr'
        | 'beacon'
        | 'fetch'
        | 'css'
        | 'js'
        | 'image'
        | 'font'
        | 'media'
        | 'other'
        | 'native'
      /**
       * HTTP method of the resource
       */
      readonly method?: 'POST' | 'GET' | 'HEAD' | 'PUT' | 'DELETE' | 'PATCH' | 'TRACE' | 'OPTIONS' | 'CONNECT'
      /**
       * URL of the resource
       */
      url: string
      /**
       * HTTP status code of the resource
       */
      readonly status_code?: number
      /**
       * Duration of the resource
       */
      readonly duration?: number
      /**
       * Size in octet of the resource response body
       */
      readonly size?: number
      /**
       * Size in octet of the resource before removing any applied content encodings
       */
      readonly encoded_body_size?: number
      /**
       * Size in octet of the resource after removing any applied encoding
       */
      readonly decoded_body_size?: number
      /**
       * Size in octet of the fetched resource
       */
      readonly transfer_size?: number
      /**
       * Render blocking status of the resource
       */
      readonly render_blocking_status?: 'blocking' | 'non-blocking'
      /**
       * Worker phase properties
       */
      readonly worker?: {
        /**
         * Duration in nanoseconds of the resource worker phase
         */
        readonly duration: number
        /**
         * Duration in nanoseconds between start of the request and start of the worker phase
         */
        readonly start: number
        [k: string]: unknown
      }
      /**
       * Redirect phase properties
       */
      readonly redirect?: {
        /**
         * Duration in ns of the resource redirect phase
         */
        readonly duration: number
        /**
         * Duration in ns between start of the request and start of the redirect phase
         */
        readonly start: number
        [k: string]: unknown
      }
      /**
       * DNS phase properties
       */
      readonly dns?: {
        /**
         * Duration in ns of the resource dns phase
         */
        readonly duration: number
        /**
         * Duration in ns between start of the request and start of the dns phase
         */
        readonly start: number
        [k: string]: unknown
      }
      /**
       * Connect phase properties
       */
      readonly connect?: {
        /**
         * Duration in ns of the resource connect phase
         */
        readonly duration: number
        /**
         * Duration in ns between start of the request and start of the connect phase
         */
        readonly start: number
        [k: string]: unknown
      }
      /**
       * SSL phase properties
       */
      readonly ssl?: {
        /**
         * Duration in ns of the resource ssl phase
         */
        readonly duration: number
        /**
         * Duration in ns between start of the request and start of the ssl phase
         */
        readonly start: number
        [k: string]: unknown
      }
      /**
       * First Byte phase properties
       */
      readonly first_byte?: {
        /**
         * Duration in ns of the resource first byte phase
         */
        readonly duration: number
        /**
         * Duration in ns between start of the request and start of the first byte phase
         */
        readonly start: number
        [k: string]: unknown
      }
      /**
       * Download phase properties
       */
      readonly download?: {
        /**
         * Duration in ns of the resource download phase
         */
        readonly duration: number
        /**
         * Duration in ns between start of the request and start of the download phase
         */
        readonly start: number
        [k: string]: unknown
      }
      /**
       * Network protocol used to fetch the resource (e.g., 'http/1.1', 'h2')
       */
      readonly protocol?: string
      /**
       * Delivery type of the resource
       */
      readonly delivery_type?: 'cache' | 'navigational-prefetch' | 'other'
      /**
       * The provider for this resource
       */
      readonly provider?: {
        /**
         * The domain name of the provider
         */
        readonly domain?: string
        /**
         * The user friendly name of the provider
         */
        readonly name?: string
        /**
         * The type of provider
         */
        readonly type?:
          | 'ad'
          | 'advertising'
          | 'analytics'
          | 'cdn'
          | 'content'
          | 'customer-success'
          | 'first party'
          | 'hosting'
          | 'marketing'
          | 'other'
          | 'social'
          | 'tag-manager'
          | 'utility'
          | 'video'
        [k: string]: unknown
      }
      /**
       * GraphQL requests parameters
       */
      readonly graphql?: {
        /**
         * Type of the GraphQL operation
         */
        readonly operationType: 'query' | 'mutation' | 'subscription'
        /**
         * Name of the GraphQL operation
         */
        readonly operationName?: string
        /**
         * Content of the GraphQL operation
         */
        payload?: string
        /**
         * String representation of the operation variables
         */
        variables?: string
        [k: string]: unknown
      }
      [k: string]: unknown
    }
    /**
     * Internal properties
     */
    readonly _dd?: {
      /**
       * span identifier in decimal format
       */
      readonly span_id?: string
      /**
       * trace identifier, either a 64 bit decimal number or a 128 bit hexadecimal number padded with 0s
       */
      readonly trace_id?: string
      /**
       * trace sample rate in decimal format
       */
      readonly rule_psr?: number
      /**
       * Whether the resource should be discarded or indexed
       */
      readonly discarded?: boolean
      [k: string]: unknown
    }
    [k: string]: unknown
  }
/**
 * Schema of all properties of a View event
 */
export type RumViewEvent = CommonProperties &
  ViewContainerSchema & {
    /**
     * RUM event type
     */
    readonly type: 'view'
    /**
     * View properties
     */
    readonly view: {
      /**
       * Duration in ns to the view is considered loaded
       */
      readonly loading_time?: number
      /**
       * Duration in ns from the moment the view was started until all the initial network requests settled
       */
      readonly network_settled_time?: number
      /**
       * Duration in ns to from the last interaction on previous view to the moment the current view was displayed
       */
      readonly interaction_to_next_view_time?: number
      /**
       * Type of the loading of the view
       */
      readonly loading_type?:
        | 'initial_load'
        | 'route_change'
        | 'activity_display'
        | 'activity_redisplay'
        | 'fragment_display'
        | 'fragment_redisplay'
        | 'view_controller_display'
        | 'view_controller_redisplay'
      /**
       * Time spent on the view in ns
       */
      readonly time_spent: number
      /**
       * Duration in ns to the first rendering (deprecated in favor of `view.performance.fcp.timestamp`)
       */
      readonly first_contentful_paint?: number
      /**
       * Duration in ns to the largest contentful paint (deprecated in favor of `view.performance.lcp.timestamp`)
       */
      readonly largest_contentful_paint?: number
      /**
       * CSS selector path of the largest contentful paint element (deprecated in favor of `view.performance.lcp.target_selector`)
       */
      readonly largest_contentful_paint_target_selector?: string
      /**
       * Duration in ns of the first input event delay (deprecated in favor of `view.performance.fid.duration`)
       */
      readonly first_input_delay?: number
      /**
       * Duration in ns to the first input (deprecated in favor of `view.performance.fid.timestamp`)
       */
      readonly first_input_time?: number
      /**
       * CSS selector path of the first input target element (deprecated in favor of `view.performance.fid.target_selector`)
       */
      readonly first_input_target_selector?: string
      /**
       * Longest duration in ns between an interaction and the next paint (deprecated in favor of `view.performance.inp.duration`)
       */
      readonly interaction_to_next_paint?: number
      /**
       * Duration in ns between start of the view and start of the INP (deprecated in favor of `view.performance.inp.timestamp`)
       */
      readonly interaction_to_next_paint_time?: number
      /**
       * CSS selector path of the interacted element corresponding to INP (deprecated in favor of `view.performance.inp.target_selector`)
       */
      readonly interaction_to_next_paint_target_selector?: string
      /**
       * Total layout shift score that occurred on the view (deprecated in favor of `view.performance.cls.score`)
       */
      readonly cumulative_layout_shift?: number
      /**
       * Duration in ns between start of the view and start of the largest layout shift contributing to CLS (deprecated in favor of `view.performance.cls.timestamp`)
       */
      readonly cumulative_layout_shift_time?: number
      /**
       * CSS selector path of the first element (in document order) of the largest layout shift contributing to CLS (deprecated in favor of `view.performance.cls.target_selector`)
       */
      readonly cumulative_layout_shift_target_selector?: string
      /**
       * Duration in ns to the complete parsing and loading of the document and its sub resources
       */
      readonly dom_complete?: number
      /**
       * Duration in ns to the complete parsing and loading of the document without its sub resources
       */
      readonly dom_content_loaded?: number
      /**
       * Duration in ns to the end of the parsing of the document
       */
      readonly dom_interactive?: number
      /**
       * Duration in ns to the end of the load event handler execution
       */
      readonly load_event?: number
      /**
       * Duration in ns to the response start of the document request
       */
      readonly first_byte?: number
      /**
       * User custom timings of the view. As timing name is used as facet path, it must contain only letters, digits, or the characters - _ . @ $
       */
      readonly custom_timings?: {
        [k: string]: number
      }
      /**
       * Whether the View corresponding to this event is considered active
       */
      readonly is_active?: boolean
      /**
       * Whether the View had a low average refresh rate
       */
      readonly is_slow_rendered?: boolean
      /**
       * Properties of the actions of the view
       */
      readonly action: {
        /**
         * Number of actions that occurred on the view
         */
        readonly count: number
        [k: string]: unknown
      }
      /**
       * Properties of the errors of the view
       */
      readonly error: {
        /**
         * Number of errors that occurred on the view
         */
        readonly count: number
        [k: string]: unknown
      }
      /**
       * Properties of the crashes of the view
       */
      readonly crash?: {
        /**
         * Number of crashes that occurred on the view
         */
        readonly count: number
        [k: string]: unknown
      }
      /**
       * Properties of the long tasks of the view
       */
      readonly long_task?: {
        /**
         * Number of long tasks that occurred on the view
         */
        readonly count: number
        [k: string]: unknown
      }
      /**
       * Properties of the frozen frames of the view
       */
      readonly frozen_frame?: {
        /**
         * Number of frozen frames that occurred on the view
         */
        readonly count: number
        [k: string]: unknown
      }
      /**
       * List of slow frames during the view’s lifetime
       */
      readonly slow_frames?: {
        /**
         * Duration in ns between start of the view and the start of the slow frame
         */
        readonly start: number
        /**
         * Duration in ns of the slow frame
         */
        readonly duration: number
        [k: string]: unknown
      }[]
      /**
       * Properties of the resources of the view
       */
      readonly resource: {
        /**
         * Number of resources that occurred on the view
         */
        readonly count: number
        [k: string]: unknown
      }
      /**
       * Properties of the frustrations of the view
       */
      readonly frustration?: {
        /**
         * Number of frustrations that occurred on the view
         */
        readonly count: number
        [k: string]: unknown
      }
      /**
       * List of the periods of time the user had the view in foreground (focused in the browser)
       */
      readonly in_foreground_periods?: {
        /**
         * Duration in ns between start of the view and start of foreground period
         */
        readonly start: number
        /**
         * Duration in ns of the view foreground period
         */
        readonly duration: number
        [k: string]: unknown
      }[]
      /**
       * Average memory used during the view lifetime (in bytes)
       */
      readonly memory_average?: number
      /**
       * Peak memory used during the view lifetime (in bytes)
       */
      readonly memory_max?: number
      /**
       * Total number of cpu ticks during the view’s lifetime
       */
      readonly cpu_ticks_count?: number
      /**
       * Average number of cpu ticks per second during the view’s lifetime
       */
      readonly cpu_ticks_per_second?: number
      /**
       * Average refresh rate during the view’s lifetime (in frames per second)
       */
      readonly refresh_rate_average?: number
      /**
       * Minimum refresh rate during the view’s lifetime (in frames per second)
       */
      readonly refresh_rate_min?: number
      /**
       * Rate of slow frames during the view’s lifetime (in milliseconds per second)
       */
      readonly slow_frames_rate?: number
      /**
       * Rate of freezes during the view’s lifetime (in seconds per hour)
       */
      readonly freeze_rate?: number
      /**
       * Time taken for Flutter 'build' methods.
       */
      flutter_build_time?: RumPerfMetric
      /**
       * Time taken for Flutter to rasterize the view.
       */
      flutter_raster_time?: RumPerfMetric
      /**
       * The JavaScript refresh rate for React Native
       */
      js_refresh_rate?: RumPerfMetric
      /**
       * Performance data. (Web Vitals, etc.)
       */
      performance?: ViewPerformanceData
      [k: string]: unknown
    }
    /**
     * Session properties
     */
    readonly session?: {
      /**
       * Whether this session is currently active. Set to false to manually stop a session
       */
      readonly is_active?: boolean
      /**
       * Whether this session has been sampled for replay
       */
      readonly sampled_for_replay?: boolean
      [k: string]: unknown
    }
    /**
     * Feature flags properties
     */
    readonly feature_flags?: {
      [k: string]: unknown
    }
    /**
     * Privacy properties
     */
    readonly privacy?: {
      /**
       * The replay privacy level
       */
      readonly replay_level: 'allow' | 'mask' | 'mask-user-input'
      [k: string]: unknown
    }
    /**
     * Internal properties
     */
    readonly _dd: {
      /**
       * Version of the update of the view event
       */
      readonly document_version: number
      /**
       * List of the page states during the view
       */
      readonly page_states?: {
        /**
         * Page state name
         */
        readonly state: 'active' | 'passive' | 'hidden' | 'frozen' | 'terminated'
        /**
         * Duration in ns between start of the view and start of the page state
         */
        readonly start: number
        [k: string]: unknown
      }[]
      /**
       * Debug metadata for Replay Sessions
       */
      replay_stats?: {
        /**
         * The number of records produced during this view lifetime
         */
        records_count?: number
        /**
         * The number of segments sent during this view lifetime
         */
        segments_count?: number
        /**
         * The total size in bytes of the segments sent during this view lifetime
         */
        segments_total_raw_size?: number
        [k: string]: unknown
      }
      /**
       * Additional information of the reported Cumulative Layout Shift
       */
      readonly cls?: {
        /**
         * Pixel ratio of the device where the layout shift was reported
         */
        readonly device_pixel_ratio?: number
        [k: string]: unknown
      }
      /**
       * Subset of the SDK configuration options in use during its execution
       */
      readonly configuration?: {
        /**
         * Whether session replay recording configured to start manually
         */
        readonly start_session_replay_recording_manually?: boolean
        [k: string]: unknown
      }
      /**
       * Profiling context
       */
      profiling?: ProfilingInternalContextSchema
      [k: string]: unknown
    }
    /**
     * Display properties
     */
    readonly display?: {
      /**
       * Scroll properties
       */
      readonly scroll?: {
        /**
         * Distance between the top and the lowest point reached on this view (in pixels)
         */
        readonly max_depth: number
        /**
         * Page scroll top (scrolled distance) when the maximum scroll depth was reached for this view (in pixels)
         */
        readonly max_depth_scroll_top: number
        /**
         * Maximum page scroll height (total height) for this view (in pixels)
         */
        readonly max_scroll_height: number
        /**
         * Duration between the view start and the time the max scroll height was reached for this view (in nanoseconds)
         */
        readonly max_scroll_height_time: number
        [k: string]: unknown
      }
      [k: string]: unknown
    }
    [k: string]: unknown
  }
/**
 * Schema of all properties of a Vital event
 */
export type RumVitalEvent = CommonProperties &
  ViewContainerSchema & {
    /**
     * RUM event type
     */
    readonly type: 'vital'
    /**
     * Vital properties
     */
    readonly vital: {
      /**
       * Type of the vital
       */
      readonly type: 'duration'
      /**
       * UUID of the vital
       */
      readonly id: string
      /**
       * Name of the vital, as it is also used as facet path for its value, it must contain only letters, digits, or the characters - _ . @ $
       */
      readonly name?: string
      /**
       * Description of the vital. It can be used as a secondary identifier (URL, React component name...)
       */
      readonly description?: string
      /**
       * Duration of the vital in nanoseconds
       */
      readonly duration?: number
      /**
       * User custom vital.
       */
      readonly custom?: {
        [k: string]: number
      }
      [k: string]: unknown
    }
    /**
     * Internal properties
     */
    readonly _dd?: {
      /**
       * Internal vital properties
       */
      readonly vital?: {
        /**
         * Whether the value of the vital is computed by the SDK (as opposed to directly provided by the customer)
         */
        readonly computed_value?: boolean
        [k: string]: unknown
      }
      [k: string]: unknown
    }
    [k: string]: unknown
  }

/**
 * Schema of common properties of RUM events
 */
export interface CommonProperties {
  /**
   * Start of the event in ms from epoch
   */
  readonly date: number
  /**
   * Application properties
   */
  readonly application: {
    /**
     * UUID of the application
     */
    readonly id: string
    [k: string]: unknown
  }
  /**
   * The service name for this application
   */
  service?: string
  /**
   * The version for this application
   */
  version?: string
  /**
   * The build version for this application
   */
  readonly build_version?: string
  /**
   * Generated unique ID of the application build. Unlike version or build_version this field is not meant to be coming from the user, but rather generated by the tooling for each build.
   */
  readonly build_id?: string
  /**
   * Session properties
   */
  readonly session: {
    /**
     * UUID of the session
     */
    readonly id: string
    /**
     * Type of the session
     */
    readonly type: 'user' | 'synthetics' | 'ci_test'
    /**
     * Whether this session has a replay
     */
    readonly has_replay?: boolean
    [k: string]: unknown
  }
  /**
   * The source of this event
   */
  readonly source?:
    | 'android'
    | 'ios'
    | 'browser'
    | 'flutter'
    | 'react-native'
    | 'roku'
    | 'unity'
    | 'kotlin-multiplatform'
  /**
   * View properties
   */
  readonly view: {
    /**
     * UUID of the view
     */
    readonly id: string
    /**
     * URL that linked to the initial view of the page
     */
    referrer?: string
    /**
     * URL of the view
     */
    url: string
    /**
     * User defined name of the view
     */
    name?: string
    [k: string]: unknown
  }
  /**
   * User properties
   */
  readonly usr?: {
    /**
     * Identifier of the user
     */
    readonly id?: string
    /**
     * Name of the user
     */
    readonly name?: string
    /**
     * Email of the user
     */
    readonly email?: string
    /**
     * Identifier of the user across sessions
     */
    readonly anonymous_id?: string
    [k: string]: unknown
  }
  /**
   * Account properties
   */
  readonly account?: {
    /**
     * Identifier of the account
     */
    readonly id: string
    /**
     * Name of the account
     */
    readonly name?: string
    [k: string]: unknown
  }
  /**
   * Device connectivity properties
   */
  connectivity?: {
    /**
     * Status of the device connectivity
     */
    readonly status: 'connected' | 'not_connected' | 'maybe'
    /**
     * The list of available network interfaces
     */
    readonly interfaces?: (
      | 'bluetooth'
      | 'cellular'
      | 'ethernet'
      | 'wifi'
      | 'wimax'
      | 'mixed'
      | 'other'
      | 'unknown'
      | 'none'
    )[]
    /**
     * Cellular connection type reflecting the measured network performance
     */
    readonly effective_type?: 'slow-2g' | '2g' | '3g' | '4g'
    /**
     * Cellular connectivity properties
     */
    readonly cellular?: {
      /**
       * The type of a radio technology used for cellular connection
       */
      readonly technology?: string
      /**
       * The name of the SIM carrier
       */
      readonly carrier_name?: string
      [k: string]: unknown
    }
    [k: string]: unknown
  }
  /**
   * Display properties
   */
  display?: {
    /**
     * The viewport represents the rectangular area that is currently being viewed. Content outside the viewport is not visible onscreen until scrolled into view.
     */
    readonly viewport?: {
      /**
       * Width of the viewport (in pixels)
       */
      readonly width: number
      /**
       * Height of the viewport (in pixels)
       */
      readonly height: number
      [k: string]: unknown
    }
    [k: string]: unknown
  }
  /**
   * Synthetics properties
   */
  readonly synthetics?: {
    /**
     * The identifier of the current Synthetics test
     */
    readonly test_id: string
    /**
     * The identifier of the current Synthetics test results
     */
    readonly result_id: string
    /**
     * Whether the event comes from a SDK instance injected by Synthetics
     */
    readonly injected?: boolean
    [k: string]: unknown
  }
  /**
   * CI Visibility properties
   */
  readonly ci_test?: {
    /**
     * The identifier of the current CI Visibility test execution
     */
    readonly test_execution_id: string
    [k: string]: unknown
  }
  /**
   * Operating system properties
   */
  os?: {
    /**
     * Operating system name, e.g. Android, iOS
     */
    readonly name: string
    /**
     * Full operating system version, e.g. 8.1.1
     */
    readonly version: string
    /**
     * Operating system build number, e.g. 15D21
     */
    readonly build?: string
    /**
     * Major operating system version, e.g. 8
     */
    readonly version_major: string
    [k: string]: unknown
  }
  /**
   * Device properties
   */
  device?: {
    /**
     * Device type info
     */
    readonly type?: 'mobile' | 'desktop' | 'tablet' | 'tv' | 'gaming_console' | 'bot' | 'other'
    /**
     * Device marketing name, e.g. Xiaomi Redmi Note 8 Pro, Pixel 5, etc.
     */
    readonly name?: string
    /**
     * Device SKU model, e.g. Samsung SM-988GN, etc. Quite often name and model can be the same.
     */
    readonly model?: string
    /**
     * Device marketing brand, e.g. Apple, OPPO, Xiaomi, etc.
     */
    readonly brand?: string
    /**
     * The CPU architecture of the device that is reporting the error
     */
    readonly architecture?: string
    /**
     * The user’s locale as a language tag combining language and region, e.g. 'en-US'.
     */
    readonly locale?: string
    /**
     * Ordered list of the user’s preferred system languages as IETF language tags.
     */
    readonly locales?: string[]
    /**
     * The device’s current time zone identifier, e.g. 'Europe/Berlin'.
     */
    readonly time_zone?: string
    [k: string]: unknown
  }
  /**
   * Internal properties
   */
  readonly _dd: {
    /**
     * Version of the RUM event format
     */
    readonly format_version: 2
    /**
     * Session-related internal properties
     */
    session?: {
      /**
       * Session plan: 1 is the plan without replay, 2 is the plan with replay (deprecated)
       */
      plan?: 1 | 2
      /**
       * The precondition that led to the creation of the session
       */
      readonly session_precondition?:
        | 'user_app_launch'
        | 'inactivity_timeout'
        | 'max_duration'
        | 'background_launch'
        | 'prewarm'
        | 'from_non_interactive_session'
        | 'explicit_stop'
      [k: string]: unknown
    }
    /**
     * Subset of the SDK configuration options in use during its execution
     */
    readonly configuration?: {
      /**
       * The percentage of sessions tracked
       */
      readonly session_sample_rate: number
      /**
       * The percentage of sessions with RUM & Session Replay pricing tracked
       */
      readonly session_replay_sample_rate?: number
      /**
       * The percentage of views profiled
       */
      readonly profiling_sample_rate?: number
      [k: string]: unknown
    }
    /**
     * Browser SDK version
     */
    readonly browser_sdk_version?: string
    /**
     * SDK name (e.g. 'logs', 'rum', 'rum-slim', etc.)
     */
    readonly sdk_name?: string
    [k: string]: unknown
  }
  /**
   * User provided context
   */
  context?: {
    [k: string]: unknown
  }
  [k: string]: unknown
}
/**
 * View Container schema for views that are nested (webviews in mobile)
 */
export interface ViewContainerSchema {
  /**
   * View Container properties (view wrapping the current view)
   */
  readonly container?: {
    /**
     * Attributes of the view's container
     */
    readonly view: {
      /**
       * ID of the parent view
       */
      readonly id: string
      [k: string]: unknown
    }
    /**
     * Source of the parent view
     */
    readonly source:
      | 'android'
      | 'ios'
      | 'browser'
      | 'flutter'
      | 'react-native'
      | 'roku'
      | 'unity'
      | 'kotlin-multiplatform'
    [k: string]: unknown
  }
  [k: string]: unknown
}
/**
 * Schema of all properties of events that can have parent actions
 */
export interface ActionChildProperties {
  /**
   * Action properties
   */
  readonly action?: {
    /**
     * UUID of the action
     */
    readonly id: string | string[]
    [k: string]: unknown
  }
  [k: string]: unknown
}
/**
 * RUM Profiler Internal Context schema
 */
export interface ProfilingInternalContextSchema {
  /**
   * Used to track the status of the RUM Profiler.
   *
   * They are defined in order of when they can happen, from the moment the SDK is initialized to the moment the Profiler is actually running.
   *
   * - `starting`: The Profiler is starting (i.e., when the SDK just started). This is the initial status.
   * - `running`: The Profiler is running.
   * - `stopped`: The Profiler is stopped.
   * - `error`: The Profiler encountered an error. See `error_reason` for more details.
   */
  readonly status?: 'starting' | 'running' | 'stopped' | 'error'
  /**
   * The reason the Profiler encountered an error. This attribute is only present if the status is `error`.
   *
   * Possible values:
   * - `not-supported-by-browser`: The browser does not support the Profiler (i.e., `window.Profiler` is not available).
   * - `failed-to-lazy-load`: The Profiler script failed to be loaded by the browser (may be a connection issue or the chunk was not found).
   * - `missing-document-policy-header`: The Profiler failed to start because its missing `Document-Policy: js-profiling` HTTP response header.
   * - `unexpected-exception`: An exception occurred when starting the Profiler.
   */
  readonly error_reason?:
    | 'not-supported-by-browser'
    | 'failed-to-lazy-load'
    | 'missing-document-policy-header'
    | 'unexpected-exception'
  [k: string]: unknown
}
/**
 * Schema of properties for a technical performance metric
 */
export interface RumPerfMetric {
  /**
   * The minimum value seen for this metric during the view's lifetime.
   */
  readonly min: number
  /**
   * The maximum value seen for this metric during the view's lifetime.
   */
  readonly max: number
  /**
   * The average value for this metric during the view's lifetime.
   */
  readonly average: number
  /**
   * The maximum possible value we could see for this metric, if such a max is relevant and can vary from session to session.
   */
  readonly metric_max?: number
  [k: string]: unknown
}
/**
 * Schema for view-level RUM performance data (Web Vitals, etc.)
 */
export interface ViewPerformanceData {
  /**
   * Cumulative Layout Shift
   */
  readonly cls?: {
    /**
     * Total layout shift score that occurred on the view
     */
    readonly score: number
    /**
     * The time of the largest layout shift contributing to CLS, in ns since view start.
     */
    readonly timestamp?: number
    /**
     * CSS selector path of the first element (in document order) of the largest layout shift contributing to CLS
     */
    readonly target_selector?: string
    /**
     * Bounding client rect of the element before the layout shift
     */
    previous_rect?: RumRect
    /**
     * Bounding client rect of the element after the layout shift
     */
    current_rect?: RumRect
    [k: string]: unknown
  }
  /**
   * First Contentful Paint
   */
  readonly fcp?: {
    /**
     * The time of the first rendering, in ns since view start.
     */
    readonly timestamp: number
    [k: string]: unknown
  }
  /**
   * First Input Delay
   */
  readonly fid?: {
    /**
     * Duration in ns of the first input event delay
     */
    readonly duration: number
    /**
     * Time of the first input event, in ns since view start.
     */
    readonly timestamp: number
    /**
     * CSS selector path of the first input target element
     */
    readonly target_selector?: string
    [k: string]: unknown
  }
  /**
   * Interaction to Next Paint
   */
  readonly inp?: {
    /**
     * Longest duration in ns between an interaction and the next paint
     */
    readonly duration: number
    /**
     * Time of the start of the INP interaction, in ns since view start.
     */
    readonly timestamp?: number
    /**
     * CSS selector path of the interacted element for the INP interaction
     */
    readonly target_selector?: string
    [k: string]: unknown
  }
  /**
   * Largest Contentful Paint
   */
  readonly lcp?: {
    /**
     * Time of the largest contentful paint, in ns since view start.
     */
    readonly timestamp: number
    /**
     * CSS selector path of the largest contentful paint element
     */
    readonly target_selector?: string
    /**
     * URL of the largest contentful paint element
     */
    resource_url?: string
    [k: string]: unknown
  }
  /**
   * First Build Complete (Flutter)
   */
  readonly fbc?: {
    /**
     * Time of all completed `build` methods after a route change, in ns since view start.
     */
    readonly timestamp: number
    [k: string]: unknown
  }
  [k: string]: unknown
}
/**
 * Schema for DOMRect-like rectangles describing an element's bounding client rect
 */
export interface RumRect {
  /**
   * The x coordinate of the element's origin
   */
  readonly x: number
  /**
   * The y coordinate of the element's origin
   */
  readonly y: number
  /**
   * The element's width
   */
  readonly width: number
  /**
   * The element's height
   */
  readonly height: number
  [k: string]: unknown
}
