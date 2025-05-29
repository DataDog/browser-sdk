/* eslint-disable local-rules/disallow-side-effects */
/**
 * Polyfill for globalThis that runs before any other code
 * Based on https://mathiasbynens.be/notes/globalthis
 */

function polyfillGlobalThis() {
  if (typeof globalThis === 'undefined') {
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

    // Define globalThis if it doesn't exist
    Object.defineProperty(globalObject as object, 'globalThis', {
      value: globalObject,
      writable: true,
      enumerable: false,
      configurable: true,
    })
  }
}

polyfillGlobalThis()
