export interface LogsEvent {
  /**
   * Start of the log in ms from epoch
   */
  date: number
  /**
   * The log message
   */
  message: string
  /**
   * The log status
   */
  status: 'debug' | 'info' | 'warn' | 'error'
  /**
   * Origin of the log
   */
  origin?: 'network' | 'source' | 'console' | 'logger' | 'agent' | 'report' | 'custom'
  /**
   * UUID of the application
   */
  application_id?: string
  /**
   * The service name
   */
  service?: string
  /**
   * UUID of the session
   */
  session_id?: string
  /**
   * View properties
   */
  view: {
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
    id?: string

    [k: string]: unknown
  }
  /**
   * Logger properties
   */
  logger?: {
    /**
     * Name of the logger
     */
    name: string

    [k: string]: unknown
  }
  /**
   * Error properties
   */
  error?: {
    /**
     * Kind of the error
     */
    kind?: string
    /**
     * Origin of the error
     */
    origin: 'network' | 'source' | 'console' | 'logger' | 'agent' | 'report' | 'custom'
    /**
     * Stacktrace of the error
     */
    stack?: string

    [k: string]: unknown
  }
  /**
   * Resource properties of the error
   */
  http: {
    /**
     * HTTP method of the resource
     */
    method: 'POST' | 'GET' | 'HEAD' | 'PUT' | 'DELETE' | 'PATCH'
    /**
     * HTTP Status code of the resource
     */
    status_code: number
    /**
     * URL of the resource
     */
    url: string

    [k: string]: unknown
  }

  [k: string]: unknown
}
