import type { SessionStore } from '@datadog/core-next'
import { areCookiesAuthorized } from '../../browser/cookie'
import type { CookieOptions } from '../../browser/cookie'
import { CookieStore } from './cookieStore'
import { LocalStorageStore } from './localStorageStore'
import { MemoryStore } from './memoryStore'

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
    return new CookieStore(options?.cookieOptions)
  }
  if (isLocalStorageAvailable()) {
    return new LocalStorageStore()
  }
  return new MemoryStore()
}

export { selectStore, isLocalStorageAvailable }
export type { SelectStoreOptions }
