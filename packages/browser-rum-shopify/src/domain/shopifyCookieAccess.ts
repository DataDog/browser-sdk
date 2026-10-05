import { ONE_SECOND } from '@datadog/js-core/time'
import { monitorError } from '@datadog/js-core/monitor'
import { buildCookieString, clearInterval, Observable, setInterval } from '@datadog/browser-core'
import type { CookieAccess, CookieAccessFactory } from '@datadog/browser-core'

/**
 * Subset of the Web Pixel `browser` API. Its methods run asynchronously in the top frame.
 * See https://shopify.dev/docs/api/web-pixels-api/standard-api/browser
 */
export interface ShopifyBrowserApi {
  cookie: {
    get: (name: string) => Promise<string>
    set: (cookie: string) => Promise<string>
  }
}

export const WATCH_SHOPIFY_COOKIE_INTERVAL_DELAY = ONE_SECOND

/**
 * Persists the session in the top frame cookies through the Web Pixel `browser.cookie` API, so a
 * Web Pixel worker (which has no `document.cookie` nor Cookie Store API) shares the storefront
 * session.
 */
export function createShopifyCookieAccessFactory(browser: ShopifyBrowserApi): CookieAccessFactory {
  return (cookieName, cookieOptions): CookieAccess => {
    let previousValues: string[] | undefined

    async function getAll() {
      const value = await browser.cookie.get(cookieName)
      return value ? [value] : []
    }

    function notifyIfChanged(values: string[]) {
      if (previousValues !== undefined && String(values) !== String(previousValues)) {
        observable.notify()
      }
      previousValues = values
    }

    // `browser.cookie` has no change event: poll it, like the `document.cookie` access does
    const observable = new Observable<void>(() => {
      const intervalId = setInterval(() => {
        getAll().then(notifyIfChanged).catch(monitorError)
      }, WATCH_SHOPIFY_COOKIE_INTERVAL_DELAY)
      return () => clearInterval(intervalId)
    })

    return {
      getAll,

      async getAllAndSet(cb) {
        const { value, expireDelay } = cb(await getAll())
        await browser.cookie.set(buildCookieString(cookieName, value, expireDelay, cookieOptions))
        notifyIfChanged([value])
      },

      async delete() {
        await browser.cookie.set(buildCookieString(cookieName, '', 0, cookieOptions))
        notifyIfChanged([])
      },

      observable,
    }
  }
}
