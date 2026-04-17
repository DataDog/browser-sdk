import { setInterval, clearInterval } from '../tools/timer'
import { dateNow, ONE_SECOND } from '../tools/utils/timeUtils'
import { Observable } from '../tools/observable'
import { mockable } from '../tools/mockable'
import type { Configuration } from '../domain/configuration'
import { addTelemetryDebug } from '../domain/telemetry'
import { addEventListener, DOM_EVENT } from './addEventListener'
import type { CookieOptions } from './cookie'
import { getCookies, setCookie } from './cookie'
import type { CookieStoreWindow } from './browser.types'

export interface CookieAccessItem {
  value: string
  domain?: string
  partitioned?: boolean
}

export interface CookieAccess {
  getAll(): Promise<string[]>
  getAllAndSet(cb: (value: string[]) => { value: string; expireDelay: number }): Promise<void>
  observable: Observable<void>
}

export function createCookieAccess(
  cookieName: string,
  configuration: Configuration,
  cookieOptions: CookieOptions
): CookieAccess {
  const cookieStore = mockable((window as CookieStoreWindow).cookieStore)
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
  const observable = new Observable<void>(() => {
    const listener = addEventListener(configuration, cookieStore, DOM_EVENT.CHANGE, (event) => {
      // Based on our experimentation, we're assuming that entries for the same cookie cannot be in both the 'changed' and 'deleted' arrays.
      // However, due to ambiguity in the specification, we asked for clarification: https://github.com/WICG/cookie-store/issues/226
      const changeEvent =
        event.changed.some((event) => event.name === cookieName) ||
        event.deleted.some((event) => event.name === cookieName)
      if (changeEvent) {
        observable.notify()
      }
    })
    return listener.stop
  })

  return {
    async getAll() {
      const items = await cookieStore.getAll(cookieName)
      return items.map((item) => item.value)
    },

    async getAllAndSet(cb: (value: string[]) => { value: string; expireDelay: number }) {
      const items = await cookieStore.getAll(cookieName)

      const currentValues = items.map((item) => item.value)
      const { value, expireDelay } = cb(currentValues)

      try {
        await cookieStore.set({
          name: cookieName,
          value,
          expires: dateNow() + expireDelay,
          path: '/',
          sameSite: cookieOptions.crossSite ? 'none' : 'strict',
          domain: cookieOptions.domain,
          secure: cookieOptions.secure,
          partitioned: cookieOptions.partitioned,
        })
      } catch (error) {
        const documentCookies = getCookies(cookieName)
        // monitor-until: 2026-07-01
        addTelemetryDebug('Failed to set cookie using Cookie Store API', {
          'error.message': (error as Error).message,
          newValue: value,
          cookieOptions: {
            ...cookieOptions,
          },
          cookies: items.map((item) => ({
            ...item,
          })),
          cookieCount: items.length,
          documentCookies,
        })
      }
    },

    observable,
  }
}

export const WATCH_COOKIE_INTERVAL_DELAY = ONE_SECOND
function createDocumentCookieAccess(cookieName: string, cookieOptions: CookieOptions): CookieAccess {
  let previousCookieValues = getCookies(cookieName)

  const observable = new Observable<void>(() => {
    const watchCookieIntervalId = setInterval(() => {
      const cookieValues = getCookies(cookieName)
      notifyCookieValueIfChanged(cookieValues)
    }, WATCH_COOKIE_INTERVAL_DELAY)

    return () => {
      clearInterval(watchCookieIntervalId)
    }
  })

  function notifyCookieValueIfChanged(cookieValues: string[]) {
    if (String(cookieValues) !== String(previousCookieValues)) {
      previousCookieValues = cookieValues
      observable.notify()
    }
  }

  return {
    getAll() {
      return Promise.resolve(getCookies(cookieName))
    },

    async getAllAndSet(cb: (value: string[]) => { value: string; expireDelay: number }) {
      const currentValue = getCookies(cookieName)
      const { value, expireDelay } = cb(currentValue)
      setCookie(cookieName, value, expireDelay, cookieOptions)
      await Promise.resolve()
      notifyCookieValueIfChanged([value])
    },

    observable,
  }
}
