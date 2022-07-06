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
   * The telemetry information
   */
  telemetry: {
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
   * The telemetry information
   */
  telemetry: {
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
