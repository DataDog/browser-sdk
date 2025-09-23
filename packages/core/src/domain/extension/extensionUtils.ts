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
  // Support both Chrome-style ("at ...") and Firefox-style ("fn@url" or "@url") frames.
  const frameLines = stack
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => /^at\s+/.test(l) || /@/.test(l))
  const target = frameLines[1] || ''

  return containsExtensionUrl(target)
}

export function extractExtensionUrlFromStack(stack: string = ''): string | undefined {
  // Extract extension origin for both Chrome-style and Firefox-style frames
  for (const prefix of EXTENSION_PREFIXES) {
    const regex = new RegExp(`${prefix}[^/]+`)
    const match = stack.match(regex)
    if (match) {
      return match[0]
    }
  }
}
