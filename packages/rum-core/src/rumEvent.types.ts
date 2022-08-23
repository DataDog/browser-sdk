/* eslint-disable */
/**
 * DO NOT MODIFY IT BY HAND. Run `yarn rum-events-format:sync` instead.
 */

/**
 * Schema of all properties of a RUM event
 */
export type RumEvent = RumActionEvent | RumErrorEvent | RumLongTaskEvent | RumResourceEvent | RumViewEvent
/**
 * Schema of all properties of an Action event
 */
export type RumActionEvent = CommonProperties & {
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
  ActionChildProperties & {
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
       * Whether this error crashed the host application
       */
      readonly is_crash?: boolean
      /**
       * The type of the error
       */
      readonly type?: string
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
      readonly source_type?: 'android' | 'browser' | 'ios' | 'react-native' | 'flutter'
      /**
       * Resource properties of the error
       */
      readonly resource?: {
        /**
         * HTTP method of the resource
         */
        readonly method: 'POST' | 'GET' | 'HEAD' | 'PUT' | 'DELETE' | 'PATCH'
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
    [k: string]: unknown
  }
/**
 * Schema of all properties of a Long Task event
 */
export type RumLongTaskEvent = CommonProperties &
  ActionChildProperties & {
    /**
     * RUM event type
     */
    readonly type: 'long_task'
    /**
     * Long Task properties
     */
    readonly long_task: {
      /**
       * UUID of the long task
       */
      readonly id?: string
      /**
       * Duration in ns of the long task
       */
      readonly duration: number
      /**
       * Whether this long task is considered a frozen frame
       */
      readonly is_frozen_frame?: boolean
      [k: string]: unknown
    }
    [k: string]: unknown
  }
/**
 * Schema of all properties of a Resource event
 */
export type RumResourceEvent = CommonProperties &
  ActionChildProperties & {
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
      readonly method?: 'POST' | 'GET' | 'HEAD' | 'PUT' | 'DELETE' | 'PATCH'
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
      readonly duration: number
      /**
       * Size in octet of the resource response body
       */
      readonly size?: number
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
     * Internal properties
     */
    readonly _dd?: {
      /**
       * span identifier in decimal format
       */
      readonly span_id?: string
      /**
       * trace identifier in decimal format
       */
      readonly trace_id?: string
      /**
       * tracing sample rate in decimal format
       */
      readonly rule_psr?: number
      [k: string]: unknown
    }
    [k: string]: unknown
  }
/**
 * Schema of all properties of a View event
 */
export type RumViewEvent = CommonProperties & {
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
     * Duration in ns to the first rendering
     */
    readonly first_contentful_paint?: number
    /**
     * Duration in ns to the largest contentful paint
     */
    readonly largest_contentful_paint?: number
    /**
     * Duration in ns of the first input event delay
     */
    readonly first_input_delay?: number
    /**
     * Duration in ns to the first input
     */
    readonly first_input_time?: number
    /**
     * Total layout shift score that occured on the view
     */
    readonly cumulative_layout_shift?: number
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
  readonly service?: string
  /**
   * The version for this application
   */
  readonly version?: string
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
  readonly source?: 'android' | 'ios' | 'browser' | 'flutter' | 'react-native' | 'roku'
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
    readonly interfaces: (
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
    readonly type: 'mobile' | 'desktop' | 'tablet' | 'tv' | 'gaming_console' | 'bot' | 'other'
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
       * Session plan: 1 is the 'lite' plan, 2 is the 'replay' plan
       */
      plan: 1 | 2
      [k: string]: unknown
    }
    /**
     * Browser SDK version
     */
    readonly browser_sdk_version?: string
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
