// eslint-disable-next-line no-restricted-imports
import type { BrowserNavigator, CookieStore } from '../browser/browser.types'

/**
 * Reflects values available in the global object (e.g. window or self). We use our own type to
 * adjust the expectations across the codebase when the native types offered by TypeScript aren't
 * sufficient.
 *
 * For example, we can mark a property as optional when it is not available in all browsers, or add
 * new browser APIs that are not yet typed properly in the typescript lib.
 *
 * Feel free to add more properties as needed, or mark some properties as optional when they are.
 */
export interface GlobalObject extends Omit<typeof globalThis, 'queueMicrotask' | 'cookieStore'> {
  navigator: BrowserNavigator

  // cookieStore is not available in all browsers yet
  cookieStore?: CookieStore

  // queueMicrotask is not available in all browsers yet
  queueMicrotask?: typeof queueMicrotask
}

/**
 * Cached reference to the global object so it can be imported and re-used.
 */
export const globalObject = globalThis as GlobalObject

export function getGlobalObject<T = GlobalObject>() {
  return globalObject as T
}

export const isWorkerEnvironment = 'WorkerGlobalScope' in globalObject
