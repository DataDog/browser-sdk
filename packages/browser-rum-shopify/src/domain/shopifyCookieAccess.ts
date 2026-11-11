// Types only, not part of the public types: no runtime or consumer dependency
// eslint-disable-next-line local-rules/enforce-prod-deps-imports
import type { ExtensionApi } from '@shopify/web-pixels-extension'
import { monitorError } from '@datadog/js-core/monitor'
import { clearInterval, Observable, setInterval } from '@datadog/js-core/util'
import { buildCookieString, WATCH_COOKIE_INTERVAL_DELAY } from '@datadog/browser-core'
import type { CookieAccess, CookieOptions } from '@datadog/browser-core'

/**
 * Reads and writes a cookie through Shopify Web Pixels `browser.cookie`, which runs in the top
 * frame (the checkout page), so the pixel shares the session cookie with the storefront SDK.
 * https://shopify.dev/docs/api/web-pixels-api/standard-api/browser
 */
export function createShopifyCookieAccess(
  cookieStore: ExtensionApi['browser']['cookie'],
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

  // `browser.cookie` has no change event, so poll for updates from other contexts.
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
