const EXTENSION_PREFIXES = ['chrome-extension://', 'moz-extension://', 'safari-extension://'];

function containsExtensionUrl(str: string): boolean {
  return EXTENSION_PREFIXES.some(prefix => str.includes(prefix));
}

/**
 * Utility function to detect if the current environment is a browser extension
 * @returns {boolean} true if running in an unsupported browser extension environment
 */
export function isUnsupportedExtensionEnvironment(): boolean {

  // Get error stack and window location
  const errorStack = new Error().stack || ''
  const windowLocation = window.location.href || ''

  // Case 1: We're in a regular web page (not an extension page)
  const isRegularWebPage = !containsExtensionUrl(windowLocation);
                          
  // Case 2: The error stack contains extension URLs
  const errorStackHasExtension = containsExtensionUrl(errorStack);

  // // Case 3: Check for extension APIs
  // const hasExtensionAPIs = typeof chrome !== 'undefined' &&
  //                         (chrome.runtime?.id !== undefined ||
  //                          chrome.extension !== undefined);

  // If we're on a regular web page but the error stack shows extension URLs,
  // or we have access to extension APIs, then an extension is injecting RUM.
  if (isRegularWebPage && errorStackHasExtension) {
    return true;
  }

  // Default case: regular web page with no extension in the stack - allow RUM
  return false
}