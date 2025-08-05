import { getGlobalObject, globalVar } from './getGlobalObject'
import { dateNow } from './utils/timeUtils'

/**
 * Detect if the current execution context is a Service Worker.
 *
 * A Service Worker runs in a dedicated WorkerGlobalScope where:
 * – `self` exists and is an instance of `ServiceWorkerGlobalScope`.
 * – `window` and `document` are undefined.
 */
export function isServiceWorkerContext(): boolean {
  const global = getGlobalObject<any>()

  // Service WorkerGlobalScope exposes specific APIs (clients, registration, skipWaiting)
  return (
    typeof global !== 'undefined' &&
    'clients' in global &&
    'registration' in global &&
    typeof global.skipWaiting === 'function'
  )
}

/**
 * Ensure that code assuming `window` and `document` globals does not crash when
 * executed inside a Service Worker.  This must be called **before** any code
 * that may reference those globals.
 */

export function ensureServiceWorkerGlobals(): void {
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
  // Use bracket notation so the build-time Replace script that transforms
  // __BUILD_ENV_* tokens into string literals does not produce invalid
  // syntax such as `g."dev"`.
  if (typeof g['__BUILD_ENV__SDK_VERSION__'] === 'undefined') {
    g['__BUILD_ENV__SDK_VERSION__'] = 'dev'
  }
  if (typeof g['__BUILD_ENV__BUILD_MODE__'] === 'undefined') {
    g['__BUILD_ENV__BUILD_MODE__'] = 'dev'
  }
  if (typeof g['__BUILD_ENV__SDK_SETUP__'] === 'undefined') {
    g['__BUILD_ENV__SDK_SETUP__'] = 'dev'
  }

  // Ensure `performance.timing.navigationStart` is defined so timeUtils works.
  if (!(g.performance as Performance & { timing?: any }).timing) {
    const navStart = dateNow() - (g.performance as Performance).now()
    ;(g.performance as Performance & { timing?: any }).timing = { navigationStart: navStart } as any
  }

  /* eslint-disable local-rules/disallow-zone-js-patched-values */
  if (typeof self.addEventListener !== 'function') {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    self.addEventListener = () => {}
  }
}
