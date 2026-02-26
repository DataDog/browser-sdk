import { dateNow } from '../tools/utils/timeUtils'
import type { CookieOptions } from './cookie'
import { getCookies, setCookie, deleteCookie } from './cookie'
import type { CookieStore } from './browser.types'

export interface CookieAccessor {
  getAll(name: string): Promise<string[]>
  set(name: string, value: string, expireDelay: number, options?: CookieOptions): Promise<void>
  delete(name: string, options?: CookieOptions): Promise<void>
}

interface CookieStoreWindow {
  cookieStore?: CookieStore
}

export function createCookieAccessor(cookieOptions: CookieOptions): CookieAccessor {
  const store = (globalThis as CookieStoreWindow).cookieStore

  if (store) {
    return createCookieStoreAccessor(store, cookieOptions)
  }

  return createDocumentCookieAccessor()
}

function createCookieStoreAccessor(store: CookieStore, cookieOptions: CookieOptions): CookieAccessor {
  return {
    async getAll(name: string): Promise<string[]> {
      const cookies = await store.getAll(name)
      return cookies.map((cookie) => cookie.value)
    },

    async set(name: string, value: string, expireDelay: number): Promise<void> {
      const expires = new Date(dateNow() + expireDelay)
      await store.set({
        name,
        value,
        domain: cookieOptions.domain,
        path: '/',
        expires,
        sameSite: cookieOptions.crossSite ? 'none' : 'strict',
        secure: cookieOptions.secure,
        partitioned: cookieOptions.partitioned,
      })
    },

    async delete(name: string): Promise<void> {
      await store.delete({
        name,
        domain: cookieOptions.domain,
        path: '/',
      })
    },
  }
}

function createDocumentCookieAccessor(): CookieAccessor {
  return {
    getAll(name: string): Promise<string[]> {
      return Promise.resolve(getCookies(name))
    },

    set(name: string, value: string, expireDelay: number, options?: CookieOptions): Promise<void> {
      setCookie(name, value, expireDelay, options)
      return Promise.resolve()
    },

    delete(name: string, options?: CookieOptions): Promise<void> {
      deleteCookie(name, options)
      return Promise.resolve()
    },
  }
}
