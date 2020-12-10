export type LogsEventsFormat = LogSchema | LogWithRumSchema

export interface LogSchema {
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
  }
  /**
   * Logger properties
   */
  readonly logger?: {
    /**
     * Name of the logger
     */
    readonly name: string
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
    readonly stack?: string
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
  }
}

export interface RumInternalContextSchema {
  /**
   * UUID of the application
   */
  readonly application_id: string
  /**
   * UUID of the session
   */
  readonly session_id: string
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
  }
}

export type LogWithRumSchema = LogSchema & RumInternalContextSchema
