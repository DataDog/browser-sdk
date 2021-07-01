export interface LogsEvent {
  /**
   * Start of the log in ms from epoch
   */
  readonly date: number
  /**
   * The log message
   */
  message: string
  /**
   * The log status
   */
  readonly status: 'debug' | 'info' | 'warn' | 'error'
  /**
   * UUID of the application
   */
  readonly application_id?: string
  /**
   * The service name
   */
  readonly service?: string
  /**
   * UUID of the session
   */
  readonly session_id?: string
  /**
   * View properties
   */
  readonly view: {
    /**
     * URL that linked to the initial view of the page
     */
    referrer?: string
    /**
     * URL of the view
     */
    url: string
    /**
     * UUID of the view
     */
    readonly id?: string

    [k: string]: unknown
  }
  /**
   * Logger properties
   */
  readonly logger?: {
    /**
     * Name of the logger
     */
    readonly name: string

    [k: string]: unknown
  }
  /**
   * Error properties
   */
  readonly error?: {
    /**
     * Kind of the error
     */
    readonly kind?: string
    /**
     * Origin of the error
     */
    readonly origin: 'network' | 'source' | 'console' | 'logger' | 'agent' | 'custom'
    /**
     * Stacktrace of the error
     */
    stack?: string

    [k: string]: unknown
  }
  /**
   * Resource properties of the error
   */
  readonly http: {
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

    [k: string]: unknown
  }

  [k: string]: unknown
}
