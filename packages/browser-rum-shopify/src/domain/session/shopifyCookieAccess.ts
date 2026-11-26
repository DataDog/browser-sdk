import { monitorError } from '@datadog/js-core/monitor'
import { buildCookieString, WATCH_COOKIE_INTERVAL_DELAY } from '@datadog/browser-core'
import { Observable, clearInterval, setInterval } from '@datadog/js-core/util'
import type { CookieAccess, CookieOptions } from '@datadog/browser-core'
import type { ShopifyBrowserApi } from './webPixelUtils'

/**
 * Adapts the Web Pixel `browser.cookie` API (asynchronous, runs in the top frame) to the SDK's
 * `CookieAccess`. There is no cookie change event, so changes from other contexts are polled.
 */
export function createShopifyCookieAccess(
  cookieApi: ShopifyBrowserApi['cookie'],
  cookieName: string,
  cookieOptions: CookieOptions
): CookieAccess {
  let previousValues: string[] | undefined

  async function getAll() {
    const value = await cookieApi.get(cookieName)
    return value ? [value] : []
  }

  function notifyIfChanged(values: string[]) {
    if (previousValues !== undefined && String(values) !== String(previousValues)) {
      observable.notify()
    }
    previousValues = values
  }

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
      await cookieApi.set(buildCookieString(cookieName, value, expireDelay, cookieOptions))
      notifyIfChanged([value])
    },

    async delete() {
      await cookieApi.set(buildCookieString(cookieName, '', 0, cookieOptions))
      notifyIfChanged([])
    },

    observable,
  }
}
