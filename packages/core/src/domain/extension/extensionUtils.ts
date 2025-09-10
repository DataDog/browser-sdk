export const EXTENSION_PREFIXES = ['chrome-extension://', 'moz-extension://']

// Base case, the page has the SDK in the init and the error stack is in the page.
export const STACK_WITH_INIT_IN_PAGE = `Error
    at Object.<anonymous> (http://localhost:8080/datadog-rum.js:6385:32)
    at callMonitored (http://localhost:8080/datadog-rum.js:3925:19)
    at Object.init (http://localhost:8080/datadog-rum.js:3919:16)
    at http://localhost:8080/:10:14`

// Base case for extension, the extension has the SDK in the init and the error stack is in the extension.
export const STACK_WITH_INIT_IN_EXTENSION = `Error
    at Object.<anonymous> (chrome-extension://abcdef/dist/contentScript.js:5416:28)
    at callMonitored (chrome-extension://abcdef/dist/contentScript.js:259:17)
    at Object.init (chrome-extension://abcdef/dist/contentScript.js:254:14)
    at chrome-extension://abcdef/dist/contentScript.js:13304:14
    at chrome-extension://abcdef/dist/contentScript.js:13315:3`

export const STACK_WITH_INIT_IN_EXTENSION_FIREFOX = `Error
    at Object.<anonymous> (moz-extension://abcdef/dist/contentScript.js:5416:28)
    at callMonitored (moz-extension://abcdef/dist/contentScript.js:259:17)
    at Object.init (moz-extension://abcdef/dist/contentScript.js:254:14)
    at moz-extension://abcdef/dist/contentScript.js:13304:14
    at moz-extension://abcdef/dist/contentScript.js:13315:3`

// Edge case, the extension patches a function from the page.
export const STACK_WITH_INIT_IN_PAGE_PATCHED = `Error
    at Object.‹anonymous> (http://localhost:8080/datadog-rum.js:6385:32)
    at callMonitored (http://localhost:8080/datadog-rum.js:3925:19)
    at Object.init (http://localhost:8080/datadog-rum.js:3919:16)
    at <anonymous>:2:23
    at Object.apply (chrome-extension://hgijklmn/WXkq0oBd.js:10:4624)
    at http://localhost:8080/:16:21`

export function containsExtensionUrl(str: string): boolean {
  return EXTENSION_PREFIXES.some((prefix) => str.includes(prefix))
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
  // If the page itself is an extension page.
  if (containsExtensionUrl(windowLocation)) {
    return false
  }

  // Consider only the 3rd frame line, which is the init caller.
  const frameLines = stack.split('\n').filter((l) => /^\s*at\s+/.test(l))
  const target = frameLines[2] || ''

  return containsExtensionUrl(target)
}

export function extractExtensionUrlFromStack(stack: string = ''): string | undefined {
  for (const prefix of EXTENSION_PREFIXES) {
    const match = stack.match(new RegExp(`${prefix}[^/]+`))
    if (match) {
      return match[0]
    }
  }
}
