import { display, matchList } from '@datadog/browser-core'
import type { RumInitConfiguration } from '../configuration'

export const EXTENSION_PREFIXES = ['chrome-extension://', 'moz-extension://']

export function containsExtensionUrl(str: string): boolean {
  return EXTENSION_PREFIXES.some((prefix) => str.includes(prefix))
}

/**
 * Utility function to detect if the SDK is being initialized in an unsupported browser extension environment.
 * @param windowLocation The current window location to check
 * @param stack The error stack to check for extension URLs
 * @returns {boolean} true if running in an unsupported browser extension environment
 */
export function isUnsupportedExtensionEnvironment(
  windowLocation = typeof location !== 'undefined' ? location.href : '',
  stack = new Error().stack
) {
  // If we're on a regular web page but the error stack shows extension URLs,
  // or we have access to extension APIs, then an extension is injecting RUM.
  return !containsExtensionUrl(windowLocation) && containsExtensionUrl(stack || '')
}

export function checkForAllowedTrackingOrigins(
  configuration: RumInitConfiguration,
  windowLocation = typeof location !== 'undefined' ? location.href : '',
  errorStack?: string
) {
  if (isUnsupportedExtensionEnvironment(windowLocation, errorStack)) {
    const allowedTrackingOrigins = configuration.allowedTrackingOrigins

    if (!allowedTrackingOrigins) {
      display.warn(WarnDoesNotHaveAllowedTrackingOrigin)
      return
    }

    const isAllowed = matchList(allowedTrackingOrigins, windowLocation, true)

    if (!isAllowed) {
      display.warn(WarnNotAllowedTrackingOrigin)
    }
    return
  }
}

export const WarnDoesNotHaveAllowedTrackingOrigin =
  'Running the Browser SDK in a Web extension content script is discouraged and will be forbidden in a future major release unless the `allowedTrackingOrigins` option is provided.'
export const WarnNotAllowedTrackingOrigin = 'SDK is being initialized from an extension on a non-allowed domain.'
