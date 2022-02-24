/* eslint-disable */
/**
 * DO NOT MODIFY IT BY HAND. Run `yarn rum-events-format:sync` instead.
 */

/**
 * Schema of all properties of a telemetry event
 */
export type TelemetryEvent = TelemetryErrorEvent | TelemetryDebugEvent
/**
 * Schema of all properties of a telemetry error event
 */
export type TelemetryErrorEvent = CommonTelemetryProperties & {
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
/**
 * Schema of all properties of a telemetry debug event
 */
export type TelemetryDebugEvent = CommonTelemetryProperties & {
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

/**
 * Schema of common properties of Telemetry events
 */
export interface CommonTelemetryProperties {
  /**
   * Internal properties
   */
  _dd: {
    /**
     * Event type
     */
    event_type: 'internal_telemetry'
    [k: string]: unknown
  }
  /**
   * Start of the event in ms from epoch
   */
  date: number
  /**
   * The SDK generating the telemetry event
   */
  service: string
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
  [k: string]: unknown
}
