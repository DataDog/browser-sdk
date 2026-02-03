import type { RumInitConfiguration } from '@datadog/browser-rum-core'

/**
 * Configuration for Next.js instrumentation file pattern.
 */
export interface NextjsRumConfig {
  /**
   * Datadog RUM initialization configuration.
   */
  datadogConfig: RumInitConfiguration

  /**
   * Next.js-specific configuration options.
   */

  nextjsConfig?: {
    /**
     * Whether to capture early errors that occur before the app fully initializes.
     *
     * @default false
     */

    captureEarlyErrors?: boolean
  }
}
