const EXTENSION_PREFIXES = ['chrome-extension://', 'moz-extension://', 'safari-extension://'];

function containsExtensionUrl(str: string): boolean {
  return EXTENSION_PREFIXES.some(prefix => str.includes(prefix));
}

// Define a minimal type for the Chrome extension API
interface ChromeRuntime {
  id?: string;
}

interface ChromeExtension {
  getURL?: (path: string) => string;
}

interface Chrome {
  runtime?: ChromeRuntime;
  extension?: ChromeExtension;
}

// Declare chrome as a global variable
declare const chrome: Chrome | undefined;

// Declare the extension override flag
declare global {
  interface Window {
    _DATADOG_EXTENSION_OVERRIDE?: boolean;
  }
}

/**
 * Utility function to detect if the current environment is a browser extension
 * @returns {boolean} true if running in an unsupported browser extension environment
 */
export function isUnsupportedExtensionEnvironment(): boolean {
  // If the extension override flag is set, allow RUM to run
  // This is used by our official extension to deliberately override RUM
  if (window._DATADOG_EXTENSION_OVERRIDE === true) {
    return false;
  }

  // Get error stack and window location
  const errorStack = new Error().stack || ''
  const windowLocation = window.location.href || ''

  // Case 1: We're in a regular web page (not an extension page)
  const isRegularWebPage = !containsExtensionUrl(windowLocation);
                          
  // Case 2: The error stack contains extension URLs
  const errorStackHasExtension = containsExtensionUrl(errorStack);

  // Case 3: Check for extension APIs
  const hasExtensionAPIs = typeof chrome !== 'undefined' && 
                          (chrome.runtime?.id !== undefined || 
                           chrome.extension !== undefined);

  // If we're on a regular web page but the error stack shows extension URLs,
  // or we have access to extension APIs, then an extension is injecting RUM.
  if (isRegularWebPage && (errorStackHasExtension || hasExtensionAPIs)) {
    return true;
  }

  // If we're on an extension page, allow RUM to run.
  if (containsExtensionUrl(windowLocation)) {
    return false;
  }

  // Default case: regular web page with no extension in the stack - allow RUM
  return false
}