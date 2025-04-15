export const EXTENSION_PREFIXES = ['chrome-extension://', 'moz-extension://', 'safari-extension://']

export function containsExtensionUrl(str: string): boolean {
  return EXTENSION_PREFIXES.some((prefix) => str.includes(prefix))
}

/**
 * Utility function to detect if the current environment is a browser extension
 * @returns {boolean} true if running in an unsupported browser extension environment
 */
export function isUnsupportedExtensionEnvironment(errorStack: string, windowLocation: string): boolean {
  // If we're on a regular web page but the error stack shows extension URLs,
  // or we have access to extension APIs, then an extension is injecting RUM.
  return !containsExtensionUrl(windowLocation) && containsExtensionUrl(errorStack)
}
