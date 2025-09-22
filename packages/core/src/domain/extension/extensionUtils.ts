export const EXTENSION_PREFIXES = ['chrome-extension://', 'moz-extension://']

// Base case, the page has the SDK in the init and the error stack is in the page.
export const STACK_WITH_INIT_IN_PAGE = `Error
    at Object.init (http://localhost:8080/datadog-rum.js:3919:16)
    at http://localhost:8080/:10:14`

// Base case for extension, the extension has the SDK in the init and the error stack is in the extension.
export const STACK_WITH_INIT_IN_EXTENSION = `Error
    at Object.init (chrome-extension://abcdef/dist/contentScript.js:254:14)
    at chrome-extension://abcdef/dist/contentScript.js:13304:14
    at chrome-extension://abcdef/dist/contentScript.js:13315:3`

export const STACK_WITH_INIT_IN_EXTENSION_FIREFOX = `Error
    at Object.init (moz-extension://abcdef/dist/contentScript.js:254:14)
    at moz-extension://abcdef/dist/contentScript.js:13304:14
    at moz-extension://abcdef/dist/contentScript.js:13315:3`

// Edge case, the extension patches a function from the page.
export const STACK_WITH_INIT_IN_PAGE_PATCHED = `Error
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

  // Since we generate the error on the init, we check the 2nd frame line.
  const frameLines = stack.split('\n').filter((l) => /^\s*at\s+/.test(l))
  const target = frameLines[1] || ''

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
