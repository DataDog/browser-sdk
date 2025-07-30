import { getGlobalObject } from './getGlobalObject'

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
    typeof (global as any).skipWaiting === 'function'
  )
} 