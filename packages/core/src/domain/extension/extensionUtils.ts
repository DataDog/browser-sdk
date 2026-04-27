export const EXTENSION_PREFIXES = ['chrome-extension://', 'moz-extension://']

export function containsExtensionUrl(str: string): boolean {
  return EXTENSION_PREFIXES.some((prefix) => str.includes(prefix))
}

/**
 * Utility function to detect if the SDK is being initialized in an unsupported browser extension environment.
 *
 * @param windowLocation - The current window location to check
 * @param stack - The error stack to check for extension URLs
 * @returns true if running in an unsupported browser extension environment
 */
export function isUnsupportedExtensionEnvironment(windowLocation: string, stack: string = '') {
  // If the page itself is an extension page.
  if (containsExtensionUrl(windowLocation)) {
    return false
  }

  // Since we generate the error on the init, we check the 2nd frame line.
  const frameLines = stack.split('\n').filter((line) => {
    const trimmedLine = line.trim()
    return trimmedLine.length && /^at\s+|@/.test(trimmedLine)
  })
  const target = frameLines[1] || ''

  return containsExtensionUrl(target)
}
