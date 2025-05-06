import { RumConfiguration } from '@datadog/browser-rum-core'
import { display } from '../display'
import { matchList } from '../matchOption'

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

export function checkForAllowedTrackingOrigins(configuration: RumConfiguration, windowLocation: string, errorStack: string) {
  if (isUnsupportedExtensionEnvironment(windowLocation, errorStack)) {
    const { allowedTrackingOrigin } = configuration

    if (!allowedTrackingOrigin) {
      display.warn(
        WarnDoesNotHaveAllowedTrackingOrigin
      )
      return
    }

    const isAllowed = matchList(allowedTrackingOrigin || [], windowLocation, true)

    if (!isAllowed) {
      display.warn(WarnNotAllowedTrackingOrigin)
    }
    return
  }
}

export const WarnDoesNotHaveAllowedTrackingOrigin = 'Running the Browser SDK in a Web extension content script is discouraged and will be forbidden in a future major release unless the `allowedTrackingUrls` option is provided.'
export const WarnNotAllowedTrackingOrigin = 'SDK is being initialized from an extension on a non-allowed domain.'