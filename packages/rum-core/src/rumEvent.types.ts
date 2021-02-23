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
  readonly type: string
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
  [k: string]: unknown
}
/**
 * Schema of all properties of an Error event
 */
export type RumErrorEvent = CommonProperties & {
  /**
   * RUM event type
   */
  readonly type: string
  /**
   * Error properties
   */
  readonly error: {
    /**
     * Error message
     */
    message: string
    /**
     * Source of the error
     */
    readonly source: 'network' | 'source' | 'console' | 'logger' | 'agent' | 'webview' | 'custom'
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
   * Action properties
   */
  readonly action?: {
    /**
     * UUID of the action
     */
    readonly id: string
    [k: string]: unknown
  }
  [k: string]: unknown
}
/**
 * Schema of all properties of a Long Task event
 */
export type RumLongTaskEvent = CommonProperties & {
  /**
   * RUM event type
   */
  readonly type: string
  /**
   * Long Task properties
   */
  readonly long_task: {
    /**
     * Duration in ns of the long task
     */
    readonly duration: number
    [k: string]: unknown
  }
  /**
   * Action properties
   */
  readonly action?: {
    /**
     * UUID of the action
     */
    readonly id: string
    [k: string]: unknown
  }
  [k: string]: unknown
}
/**
 * Schema of all properties of a Resource event
 */
export type RumResourceEvent = CommonProperties & {
  /**
   * RUM event type
   */
  readonly type: string
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
    readonly type: 'document' | 'xhr' | 'beacon' | 'fetch' | 'css' | 'js' | 'image' | 'font' | 'media' | 'other'
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
   * Action properties
   */
  readonly action?: {
    /**
     * UUID of the action
     */
    readonly id: string
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
  readonly type: string
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
     * Properties of the resources of the view
     */
    readonly resource: {
      /**
       * Number of resources that occurred on the view
       */
      readonly count: number
      [k: string]: unknown
    }
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
    readonly type: 'user' | 'synthetics'
    /**
     * Whether this session has a replay
     */
    readonly has_replay?: boolean
    [k: string]: unknown
  }
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
   * Internal properties
   */
  readonly _dd: {
    /**
     * Version of the RUM event format
     */
    readonly format_version: number
    [k: string]: unknown
  }
  [k: string]: unknown
}
