import { dateNow } from '../tools/utils/timeUtils'
import type { CookieOptions } from './cookie'
import { getCookie, getCookies, setCookie, deleteCookie } from './cookie'
import type { CookieStoreWindow } from './browser.types'

export interface CookieAccessItem {
  value: string
  domain?: string
  partitioned?: boolean
}

export interface CookieAccess {
  get(): Promise<string | undefined>
  getAll(): Promise<CookieAccessItem[]>
  set(value: string, expireDelay: number): Promise<void>
  delete(): Promise<void>
}

export function createCookieAccess(cookieName: string, cookieOptions: CookieOptions): CookieAccess {
  const cookieStore = (window as CookieStoreWindow).cookieStore
  if (cookieStore) {
    return createCookieStoreAccess(cookieName, cookieOptions, cookieStore)
  }
  return createDocumentCookieAccess(cookieName, cookieOptions)
}

function createCookieStoreAccess(
  cookieName: string,
  cookieOptions: CookieOptions,
  cookieStore: NonNullable<CookieStoreWindow['cookieStore']>
): CookieAccess {
  return {
    async get() {
      const item = await cookieStore.get(cookieName)
      return item?.value ?? undefined
    },

    async getAll() {
      const items = await cookieStore.getAll(cookieName)
      return items.map((item) => ({
        value: item.value,
        domain: item.domain,
        partitioned: item.partitioned,
      }))
    },

    set(value: string, expireDelay: number) {
      return cookieStore.set({
        name: cookieName,
        value,
        expires: dateNow() + expireDelay,
        path: '/',
        sameSite: cookieOptions.crossSite ? 'none' : 'strict',
        domain: cookieOptions.domain,
        secure: cookieOptions.secure,
        partitioned: cookieOptions.partitioned,
      })
    },

    delete() {
      return cookieStore.delete({
        name: cookieName,
        domain: cookieOptions.domain,
        path: '/',
        partitioned: cookieOptions.partitioned,
      })
    },
  }
}

function createDocumentCookieAccess(cookieName: string, cookieOptions: CookieOptions): CookieAccess {
  return {
    get() {
      return Promise.resolve(getCookie(cookieName))
    },

    getAll() {
      return Promise.resolve(getCookies(cookieName).map((value) => ({ value })))
    },

    set(value: string, expireDelay: number) {
      setCookie(cookieName, value, expireDelay, cookieOptions)
      return Promise.resolve()
    },

    delete() {
      deleteCookie(cookieName, cookieOptions)
      return Promise.resolve()
    },
  }
}
