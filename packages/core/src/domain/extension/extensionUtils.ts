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
export function isUnsupportedExtensionEnvironment(windowLocation: string, stack = new Error().stack) {
  // If we're on a regular web page but the error stack shows extension URLs,
  // then an extension is injecting RUM.
  return !containsExtensionUrl(windowLocation) && containsExtensionUrl(stack || '')
}
