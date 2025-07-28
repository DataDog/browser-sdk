/**
 * DO NOT MODIFY IT BY HAND. Run `yarn json-schemas:sync` instead.
 */

/**
 * RUM Browser & Mobile SDKs Remote Configuration properties
 */
export interface RumSdkConfig {
  /**
   * RUM feature Remote Configuration properties
   */
  rum?: {
    /**
     * UUID of the application
     */
    applicationId: string
    /**
     * The service name for this application
     */
    service?: string
    /**
     * The environment for this application
     */
    env?: string
    /**
     * The version for this application
     */
    version?: string
    /**
     * The percentage of sessions tracked
     */
    sessionSampleRate?: number
    /**
     * The percentage of sessions with RUM & Session Replay pricing tracked
     */
    sessionReplaySampleRate?: number
    /**
     * Session replay default privacy level
     */
    defaultPrivacyLevel?: string
    /**
     * Privacy control for action name
     */
    enablePrivacyForActionName?: boolean
  }
}
