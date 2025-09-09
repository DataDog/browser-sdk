export const EXTENSION_PREFIXES = ['chrome-extension://', 'moz-extension://']

export function containsExtensionUrl(str: string): boolean {
  return EXTENSION_PREFIXES.some((prefix) => str.includes(prefix))
}

interface StackFrame {
  raw: string
  functionName?: string
  url?: string
}

function parseStack(stack: string = ''): StackFrame[] {
  return (
    stack
      .split('\n')
      .map((line) => {
        // Normalize: drop a leading "Error:" and allow optional leading spaces
        const normalized = line.replace(/^Error:\s*/, '')
        const withFn = normalized.match(/^\s*at\s+(.*?)\s+\((.*)\)/)
        const noFn = !withFn && normalized.match(/^\s*at\s+(.*)/)
        const functionName = withFn ? withFn[1].trim() : undefined
        const location = withFn ? withFn[2] : noFn ? noFn[1] : ''
        const urlMatch = location && location.match(/(chrome-extension:\/\/|moz-extension:\/\/|https?:\/\/)[^\s)]+/)
        return {
          raw: line,
          functionName,
          url: urlMatch ? urlMatch[0] : undefined,
        }
      })
      // Keep only lines that look like frames
      .filter((f) => f.functionName !== undefined || f.url !== undefined)
  )
}

// Function to check if the frame is an SDK internal frame
function isSdkInternalFrame(frame: StackFrame): boolean {
  const fn = frame.functionName || ''
  const url = frame.url || ''

  return /callMonitored|monitor|Object\.init/.test(fn) || /datadog|browser-sdk|@datadog|rum\.js|logs\.js/.test(url)
}

function getInitCallerFrame(stack: string = ''): StackFrame | undefined {
  const frames = parseStack(stack)
  const idxInit = frames.findIndex(
    (f) => /(^|\.)init$/.test(f.functionName || '') || /Object\.init/.test(f.functionName || '')
  )
  if (idxInit >= 0 && frames[idxInit + 1]) {
    return frames[idxInit + 1]
  }
  // Fallback: first non-internal frame
  return frames.find((f) => !isSdkInternalFrame(f))
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
  // If we are on an extension page, we are not in an unsupported environment
  if (containsExtensionUrl(windowLocation)) {
    return false
  }
  // If the init caller frame is an extension URL, we are in an unsupported environment
  const initCallerFrame = getInitCallerFrame(stack)
  return !!(initCallerFrame && initCallerFrame.url && containsExtensionUrl(initCallerFrame.url))
}

export function extractExtensionUrlFromStack(stack: string = ''): string | undefined {
  for (const prefix of EXTENSION_PREFIXES) {
    const match = stack.match(new RegExp(`${prefix}[^/]+`))
    if (match) {
      return match[0]
    }
  }
}
