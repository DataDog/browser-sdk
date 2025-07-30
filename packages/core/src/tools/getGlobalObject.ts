/**
 * inspired by https://mathiasbynens.be/notes/globalthis
 */

export function getGlobalObject<T = typeof globalThis>(): T {
  if (typeof globalThis === 'object') {
    return globalThis as unknown as T
  }
  Object.defineProperty(Object.prototype, '_dd_temp_', {
    get() {
      return this as object
    },
    configurable: true,
  })
  // @ts-ignore _dd_temp is defined using defineProperty
  let globalObject: unknown = _dd_temp_
  // @ts-ignore _dd_temp is defined using defineProperty
  delete Object.prototype._dd_temp_
  if (typeof globalObject !== 'object') {
    // on safari _dd_temp_ is available on window but not globally
    // fallback on other browser globals check
    if (typeof self === 'object') {
      globalObject = self
    } else if (typeof window === 'object') {
      globalObject = window
    } else {
      globalObject = {}
    }
  }
  return globalObject as T
}

/**
 * Cached reference to the global object so it can be imported and re-used without
 * re-evaluating the heavyweight fallback logic in `getGlobalObject()`.
 *
 * Using `Window & typeof globalThis` keeps typing mostly compatible with
 * existing browser code while still compiling in non-DOM environments.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
export const globalVar = getGlobalObject<Window & typeof globalThis>()
