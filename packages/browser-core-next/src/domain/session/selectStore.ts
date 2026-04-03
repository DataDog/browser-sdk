import type { SessionStore } from '@datadog/core-next'
import { areCookiesAuthorized } from '../../browser/cookie'
import type { CookieOptions } from '../../browser/cookie'
import { createCookieStore } from './cookieStore'
import { createLocalStorageStore } from './localStorageStore'
import { createMemoryStore } from './memoryStore'

interface SelectStoreOptions {
  cookieOptions?: CookieOptions
}

function isLocalStorageAvailable(): boolean {
  try {
    const key = '_dd_test'
    localStorage.setItem(key, 'test')
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

function selectStore(options?: SelectStoreOptions): SessionStore {
  if (areCookiesAuthorized()) {
    return createCookieStore({ cookieOptions: options?.cookieOptions })
  }
  if (isLocalStorageAvailable()) {
    return createLocalStorageStore()
  }
  return createMemoryStore()
}

export { selectStore, isLocalStorageAvailable }
export type { SelectStoreOptions }
