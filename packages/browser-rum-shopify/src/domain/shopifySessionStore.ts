import {
  areCookiesAuthorized,
  buildCookieOptions,
  createCookieSessionStore,
  SESSION_STORE_KEY,
} from '@datadog/browser-core'
import type { SessionStoreFactory } from '@datadog/browser-core'
import type { ShopifyBrowserApi } from './webPixelUtils'
import { createShopifyCookieAccess } from './shopifyCookieAccess'

export function createShopifySessionStoreFactory(browser: ShopifyBrowserApi): SessionStoreFactory {
  // Capture the host API now; defer cookie access until checkout and consent.
  return async (configuration) => {
    const cookieOptions = buildCookieOptions(configuration)
    if (
      !cookieOptions ||
      !(await areCookiesAuthorized(
        (name, options) => createShopifyCookieAccess(browser.cookie, name, options),
        cookieOptions
      ))
    ) {
      return
    }
    const cookieAccess = createShopifyCookieAccess(browser.cookie, SESSION_STORE_KEY, cookieOptions)
    // Legacy-cookie migration uses document.cookie, which is unavailable in the pixel worker.
    return createCookieSessionStore(cookieAccess, cookieOptions, configuration, { readLegacyCookie: false })
  }
}
