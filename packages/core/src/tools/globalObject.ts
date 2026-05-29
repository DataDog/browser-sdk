// Extend/Create the WorkerGlobalScope interface to avoid issues when used in a non-browser tsconfig environment
interface WorkerGlobalScope {
  empty: never
}

// Utility type to enforce that exactly one of the two types is used
type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never }
type XOR<T, U> = T | U extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U

export type GlobalObject = XOR<Window, WorkerGlobalScope>

export function getGlobalObject<T = typeof globalThis>(): T {
  return globalThis as unknown as T
}

/**
 * Cached reference to the global object so it can be imported and re-used without
 * re-evaluating the heavyweight fallback logic in `getGlobalObject()`.
 */
// eslint-disable-next-line local-rules/disallow-side-effects
export const globalObject = getGlobalObject<GlobalObject>()

export const isWorkerEnvironment = 'WorkerGlobalScope' in globalObject
