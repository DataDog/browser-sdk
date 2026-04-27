/**
 * inspired by https://mathiasbynens.be/notes/globalthis
 */

// Extend/Create the WorkerGlobalScope interface to avoid issues when used in a non-browser tsconfig environment
interface WorkerGlobalScope {
  empty: never
}

// Utility type to enforce that exactly one of the two types is used
type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never }
type XOR<T, U> = T | U extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U

export type GlobalObject = XOR<Window, WorkerGlobalScope>

export function getGlobalObject<T = typeof globalThis>(): T {
  if (typeof globalThis === 'object') {
    return globalThis as unknown as T
  }

  if (typeof window === 'object') {
    return window as unknown as T
  }

  if (typeof self === 'object') {
    return self as unknown as T
  }

  let globalObject: unknown

  try {
    Object.defineProperty(Object.prototype, '_dd_temp_', {
      get() {
        return this as object
      },
      configurable: true,
    })
    // @ts-ignore _dd_temp is defined using defineProperty
    globalObject = _dd_temp_
    // @ts-ignore _dd_temp is defined using defineProperty
    delete Object.prototype._dd_temp_
  } catch {
    globalObject = {}
  }

  if (typeof globalObject !== 'object') {
    globalObject = {}
  }

  return globalObject as T
}

/**
 * Cached reference to the global object so it can be imported and re-used without
 * re-evaluating the heavyweight fallback logic in `getGlobalObject()`.
 */
// eslint-disable-next-line local-rules/disallow-side-effects
export const globalObject = getGlobalObject<GlobalObject>()

export const isWorkerEnvironment = 'WorkerGlobalScope' in globalObject
