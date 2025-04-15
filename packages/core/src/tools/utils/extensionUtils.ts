export const EXTENSION_PREFIXES = ['chrome-extension://', 'moz-extension://']

export function containsExtensionUrl(str: string): boolean {
  return EXTENSION_PREFIXES.some((prefix) => str.includes(prefix))
}

/**
 * Utility function to detect if the SDK is being initialized in an unsupported browser extension environment.
 * @returns {boolean} true if running in an unsupported browser extension environment
 */
export function isUnsupportedExtensionEnvironment(errorStack: string, windowLocation: string): boolean {
  // If we're on a regular web page but the error stack shows extension URLs,
  // or we have access to extension APIs, then an extension is injecting RUM.
  return !containsExtensionUrl(windowLocation) && containsExtensionUrl(errorStack)
}
