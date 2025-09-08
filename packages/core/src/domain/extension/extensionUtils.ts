export const EXTENSION_PREFIXES = ['chrome-extension://', 'moz-extension://']

export function containsExtensionUrl(str: string): boolean {
  return EXTENSION_PREFIXES.some((prefix) => str.includes(prefix))
}

function getTopCallerFrameUrl(stack: string): string | undefined {
  if (!stack) {
    return undefined
  }

  const lines = stack
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
  const frameLines = lines.filter((l) => l.startsWith('at '))
  if (frameLines.length === 0) {
    // Handle single-line stacks like 'Error: at chrome-extension://...'
    const idx = stack.lastIndexOf(' at ')
    if (idx !== -1) {
      return stack.slice(idx + 4).trim()
    }
    return undefined
  }

  // Find init callsite just after a monitor frame if present; otherwise take the first frame
  let initFrame = frameLines[0]
  for (let i = 0; i < frameLines.length; i++) {
    const line = frameLines[i]
    if (/(^at\s+monitor\b)|(^at\s+callMonitored\b)|(^at\s+.*\bmonitor\b)/.test(line)) {
      if (i + 1 < frameLines.length) {
        initFrame = frameLines[i + 1]
      }
      break
    }
  }

  // Extract URL inside parentheses or at end of the frame
  const parenMatch = initFrame.match(/\(([^)]+)\)/)
  const locationPart = parenMatch ? parenMatch[1] : initFrame.replace(/^at\s+[^\s]+\s+/, '')
  return locationPart
}

/**
 * Utility function to detect if the SDK is being initialized in an unsupported browser extension environment.
 * Note: Because we check error stack, this will not work if the error stack is too long as Browsers truncate it.
 *
 * @param windowLocation - The current window location to check
 * @param stack - The error stack to check for extension URLs
 * @returns true if running in an unsupported browser extension environment
 */
export function isUnsupportedExtensionEnvironment(windowLocation: string, stack: string = '') {
  // If we're on a regular web page but the top caller frame (init callsite)
  // is an extension URL, then an extension is injecting RUM.
  if (containsExtensionUrl(windowLocation)) {
    return false
  }

  const topCallerUrl = getTopCallerFrameUrl(stack)
  return !!topCallerUrl && containsExtensionUrl(topCallerUrl)
}

export function extractExtensionUrlFromStack(stack: string = ''): string | undefined {
  for (const prefix of EXTENSION_PREFIXES) {
    const match = stack.match(new RegExp(`${prefix}[^/]+`))
    if (match) {
      return match[0]
    }
  }
}
