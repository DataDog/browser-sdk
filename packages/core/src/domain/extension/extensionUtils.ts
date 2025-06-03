export const EXTENSION_PREFIXES = ['chrome-extension://', 'moz-extension://']

export function startsWithExtensionUrl(str: string): boolean {
  // First check for direct extension URLs (windowLocation)
  if (EXTENSION_PREFIXES.some((prefix) => str.startsWith(prefix))) {
    return true
  }

  // If not, try to extract the first URL from the error stack
  // Look for URLs in the format: protocol://domain/path
  const urlRegex = /(https?:\/\/|chrome-extension:\/\/|moz-extension:\/\/)[^\s)]+/
  const match = str.match(urlRegex)

  if (match) {
    const firstUrl = match[0]
    return EXTENSION_PREFIXES.some((prefix) => firstUrl.startsWith(prefix))
  }

  return false
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
  return !startsWithExtensionUrl(windowLocation) && startsWithExtensionUrl(stack || '')
}
