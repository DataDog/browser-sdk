import { monitorError } from '@datadog/js-core/monitor'
import {
  buildCookieString,
  clearInterval,
  Observable,
  setInterval,
  WATCH_COOKIE_INTERVAL_DELAY,
} from '@datadog/browser-core'
import type { CookieAccess, CookieOptions } from '@datadog/browser-core'
import type { ShopifyBrowserApi } from './webPixelUtils'

export function createShopifyCookieAccess(
  cookieStore: ShopifyBrowserApi['cookie'],
  cookieName: string,
  cookieOptions: CookieOptions
): CookieAccess {
  let previousValues: string[] | undefined

  async function getAll() {
    const value = await cookieStore.get(cookieName)
    return value ? [value] : []
  }

  function notifyIfChanged(values: string[]) {
    if (previousValues !== undefined && String(values) !== String(previousValues)) {
      observable.notify()
    }
    previousValues = values
  }

  // Shopify cookies have no change event, so poll for updates from other contexts.
  const observable = new Observable<void>(() => {
    const intervalId = setInterval(() => {
      getAll().then(notifyIfChanged).catch(monitorError)
    }, WATCH_COOKIE_INTERVAL_DELAY)
    return () => clearInterval(intervalId)
  })

  return {
    getAll,

    async getAllAndSet(cb) {
      const { value, expireDelay } = cb(await getAll())
      await cookieStore.set(buildCookieString(cookieName, value, expireDelay, cookieOptions))
      notifyIfChanged([value])
    },

    async delete() {
      await cookieStore.set(buildCookieString(cookieName, '', 0, cookieOptions))
      notifyIfChanged([])
    },

    observable,
  }
}
