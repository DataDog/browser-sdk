import type { SessionStore } from '@datadog/core-next'
import { SessionPersistence } from '@datadog/core-next'
import { areCookiesAuthorized } from '../../cookie'
import type { CookieOptions } from '../../cookie'
import { CookieStore } from './cookieStore'
import { LocalStorageStore } from './localStorageStore'
import { MemoryStore } from './memoryStore'

interface SelectStoreOptions {
  cookieOptions?: CookieOptions
  sessionPersistence?: string | string[]
  sessionCookieName?: string
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

function createStoreForType(type: string, cookieOptions?: CookieOptions, cookieName?: string): SessionStore | undefined {
  switch (type) {
    case SessionPersistence.COOKIE:
      return areCookiesAuthorized() ? new CookieStore({ cookieOptions, cookieName }) : undefined
    case SessionPersistence.LOCAL_STORAGE:
      return isLocalStorageAvailable() ? new LocalStorageStore() : undefined
    case SessionPersistence.MEMORY:
      return new MemoryStore()
    default:
      return undefined
  }
}

function selectStore(options?: SelectStoreOptions): SessionStore {
  const persistence = options?.sessionPersistence

  if (persistence) {
    const types = Array.isArray(persistence) ? persistence : [persistence]
    for (const type of types) {
      const store = createStoreForType(type, options?.cookieOptions, options?.sessionCookieName)
      if (store) return store
    }
  }

  // Default: cookie → localStorage → memory
  if (areCookiesAuthorized()) {
    return new CookieStore({ cookieOptions: options?.cookieOptions, cookieName: options?.sessionCookieName })
  }
  if (isLocalStorageAvailable()) {
    return new LocalStorageStore()
  }
  return new MemoryStore()
}

export { selectStore, isLocalStorageAvailable }
export type { SelectStoreOptions }
