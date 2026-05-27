import { mockable } from './mockable'

// Extend/Create the WorkerGlobalScope interface to avoid issues when used in a non-browser tsconfig environment
interface WorkerGlobalScope {
  empty: never
}

// Utility type to enforce that exactly one of the two types is used
type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never }
type XOR<T, U> = T | U extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U

export type GlobalObject = XOR<Window, WorkerGlobalScope>

export function getGlobalObject<T = typeof globalThis>(): T {
  // Salesforce recommends to asign self to global: https://developer.salesforce.com/docs/platform/lightning-components-security/guide/lws-js.html#third-party-library-sets-up-on-global-window-object
  if (typeof self === 'object') {
    return self as unknown as T
  }

  return globalThis as unknown as T
}

/**
 * Cached reference to the global object so it can be imported and re-used without
 * re-evaluating the heavyweight fallback logic in `getGlobalObject()`.
 */
// eslint-disable-next-line local-rules/disallow-side-effects
export const globalObject = getGlobalObject<GlobalObject>()

export const isWorkerEnvironment = 'WorkerGlobalScope' in globalObject

export function getGlobalLocation<T extends { href: string } = Location>(): T | undefined {
  const location = (globalObject as unknown as { location?: T }).location
  return location && mockable(location)
}

// In Salesforce the location property must be used with accessors: https://developer.salesforce.com/docs/platform/lightning-components-security/guide/lws-limitations.html#:~:text=The%20location%20property%20must%20be%20used%20with%20these%20accessors.
// If not we crash. This way we mantain current behaviour while fallbacking safely in Salesforce.
export function getGlobalLocationHref(): string {
  return getGlobalLocation()!.href
}
