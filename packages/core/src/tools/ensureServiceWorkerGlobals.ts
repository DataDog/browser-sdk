import { globalVar } from './getGlobalObject'
import { isServiceWorkerContext } from './isServiceWorkerContext'

/**
 * Ensure that code assuming `window` and `document` globals does not crash when
 * executed inside a Service Worker.  This must be called **before** any code
 * that may reference those globals.
 */
export function ensureServiceWorkerGlobals(): void {
  if (!isServiceWorkerContext()) {
    return
  }

  const g = globalVar as any

  // Alias `window` to the global scope if missing.
  if (typeof g.window === 'undefined') {
    g.window = g
  }

  // Create a minimal `document` stub if missing.
  if (typeof g.document === 'undefined') {
    g.document = { referrer: '' }
  }

  // Provide default placeholders for build-time constants when running unbuilt sources.
  if (typeof g.__BUILD_ENV__SDK_VERSION__ === 'undefined') {
    g.__BUILD_ENV__SDK_VERSION__ = 'dev'
  }
  if (typeof g.__BUILD_ENV__BUILD_MODE__ === 'undefined') {
    g.__BUILD_ENV__BUILD_MODE__ = 'dev'
  }
  if (typeof g.__BUILD_ENV__SDK_SETUP__ === 'undefined') {
    g.__BUILD_ENV__SDK_SETUP__ = 'dev'
  }

  // Ensure `performance.timing.navigationStart` is defined so timeUtils works.
  if (!g.performance.timing) {
    const navStart = Date.now() - g.performance.now()
    g.performance.timing = { navigationStart: navStart } as any
  }
} 