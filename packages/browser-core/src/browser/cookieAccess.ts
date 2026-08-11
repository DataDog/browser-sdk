import { ONE_MINUTE, ONE_SECOND, dateNow } from '@datadog/js-core/time'
import { globalObject } from '@datadog/js-core/util'
import { setInterval, clearInterval } from '../tools/timer'
import { Observable } from '../tools/observable'
import { mockable } from '../tools/mockable'
import { display } from '../tools/display'
import { generateUUID } from '../tools/utils/stringUtils'
import { addTelemetryDebug } from '../domain/telemetry'
import { addEventListener, DOM_EVENT, isEventSupported } from './addEventListener'
import { deleteCookie, getCookies, setCookie } from './cookie'
import type { CookieOptions } from './cookie'

export interface CookieAccess {
  getAll(): Promise<string[]>
  getAllAndSet(cb: (value: string[]) => { value: string; expireDelay: number }): Promise<void>
  delete(): Promise<void>
  observable: Observable<void>
}

export type CookieAccessFactory = (cookieName: string, cookieOptions: CookieOptions) => CookieAccess

// Used to identify capability-probe cookies so their write failures aren't reported as telemetry:
// failing to write them is an expected outcome (it triggers the document.cookie fallback), not a bug.
export const TEST_COOKIE_NAME_PREFIX = 'dd_cookie_test_'

export async function areCookiesAuthorized(
  createAccess: CookieAccessFactory,
  cookieOptions: CookieOptions
): Promise<boolean> {
  // Use a unique cookie name to avoid issues when the SDK is initialized multiple times during
  // the test cookie lifetime
  const testCookieName = `${TEST_COOKIE_NAME_PREFIX}${generateUUID()}`
  const testCookieValue = 'test'
  const access = createAccess(testCookieName, cookieOptions)
  try {
    await access.getAllAndSet(() => ({ value: testCookieValue, expireDelay: ONE_MINUTE }))
    const values = await access.getAll()
    return values.includes(testCookieValue)
  } catch (error) {
    display.error(error)
    return false
  } finally {
    try {
      await access.delete()
    } catch {
      // Best-effort cleanup
    }
  }
}

export function createCookieStoreAccess(cookieName: string, cookieOptions: CookieOptions): CookieAccess {
  const cookieStore = mockable(globalObject.cookieStore)!
  const observable = new Observable<void>(() => {
    const listener = addEventListener(cookieStore, DOM_EVENT.CHANGE, (event) => {
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

    delete() {
      return cookieStore.delete({
        name: cookieName,
        domain: cookieOptions.domain,
        path: '/',
        partitioned: cookieOptions.partitioned,
      })
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
        if (!cookieName.startsWith(TEST_COOKIE_NAME_PREFIX)) {
          const documentCookies = getCookies(cookieName)
          // monitor-until: 2026-10-01
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
      }
    },

    observable,
  }
}

export const WATCH_COOKIE_INTERVAL_DELAY = ONE_SECOND
export function createDocumentCookieAccess(cookieName: string, cookieOptions: CookieOptions): CookieAccess {
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

    async delete() {
      deleteCookie(cookieName, cookieOptions)
      await Promise.resolve()
      notifyCookieValueIfChanged([])
    },

    observable,
  }
}

// Salesforce LWS does not support the change event of CookieStore objects. https://developer.salesforce.com/tools/lws-distortion-viewer
export function isCookieStoreSupported(): boolean {
  const cookieStore = mockable(globalObject.cookieStore)
  return Boolean(cookieStore && isEventSupported(cookieStore, DOM_EVENT.CHANGE))
}
