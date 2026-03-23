import { setInterval, clearInterval } from '../tools/timer'
import { dateNow, ONE_SECOND } from '../tools/utils/timeUtils'
import { Observable } from '../tools/observable'
import type { Configuration } from '../domain/configuration'
import { addEventListener, DOM_EVENT } from './addEventListener'
import type { CookieOptions } from './cookie'
import { getCookie, getCookies, setCookie } from './cookie'
import type { CookieStoreWindow } from './browser.types'
import type { CookieObservable } from './cookieObservable'

export interface CookieAccessItem {
  value: string
  domain?: string
  partitioned?: boolean
}

export interface CookieAccess {
  getAllAndSet(cb: (value: string[]) => { value: string; expireDelay: number }): Promise<void>
  observable: CookieObservable
}

export function createCookieAccess(
  cookieName: string,
  configuration: Configuration,
  cookieOptions: CookieOptions
): CookieAccess {
  const cookieStore = (window as CookieStoreWindow).cookieStore
  if (cookieStore) {
    return createCookieStoreAccess(cookieName, configuration, cookieOptions, cookieStore)
  }
  return createDocumentCookieAccess(cookieName, cookieOptions)
}

function createCookieStoreAccess(
  cookieName: string,
  configuration: Configuration,
  cookieOptions: CookieOptions,
  cookieStore: NonNullable<CookieStoreWindow['cookieStore']>
): CookieAccess {
  const observable = new Observable<string | undefined>(() => {
    const listener = addEventListener(configuration, cookieStore, DOM_EVENT.CHANGE, (event) => {
      // Based on our experimentation, we're assuming that entries for the same cookie cannot be in both the 'changed' and 'deleted' arrays.
      // However, due to ambiguity in the specification, we asked for clarification: https://github.com/WICG/cookie-store/issues/226
      const changeEvent =
        event.changed.find((event) => event.name === cookieName) ||
        event.deleted.find((event) => event.name === cookieName)
      if (changeEvent) {
        observable.notify(changeEvent.value)
      }
    })
    return listener.stop
  })

  return {
    async getAllAndSet(cb: (value: string[]) => { value: string; expireDelay: number }) {
      const items = await cookieStore.getAll(cookieName)

      const currentValues = items.map((item) => item.value)
      const { value, expireDelay } = cb(currentValues)

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

    observable,
  }
}

export const WATCH_COOKIE_INTERVAL_DELAY = ONE_SECOND
function createDocumentCookieAccess(cookieName: string, cookieOptions: CookieOptions): CookieAccess {
  let previousCookieValue = getCookie(cookieName)

  const observable = new Observable<string | undefined>(() => {
    const watchCookieIntervalId = setInterval(() => {
      const cookieValue = getCookie(cookieName)
      notifyCookieValueIfChanged(cookieValue)
    }, WATCH_COOKIE_INTERVAL_DELAY)

    return () => {
      clearInterval(watchCookieIntervalId)
    }
  })

  function notifyCookieValueIfChanged(cookieValue: string | undefined) {
    if (cookieValue !== previousCookieValue) {
      previousCookieValue = cookieValue
      observable.notify(cookieValue)
    }
  }

  return {
    async getAllAndSet(cb: (value: string[]) => { value: string; expireDelay: number }) {
      const currentValue = getCookies(cookieName)
      const { value, expireDelay } = cb(currentValue)
      setCookie(cookieName, value, expireDelay, cookieOptions)
      await Promise.resolve()
      notifyCookieValueIfChanged(value)
    },

    observable,
  }
}
