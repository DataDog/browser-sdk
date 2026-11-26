import {
  SESSION_STORE_KEY,
  areCookiesAuthorized,
  buildCookieOptions,
  createCookieSessionStore,
  initMemorySessionStoreStrategy,
} from '@datadog/browser-core'
import type { CookieAccessFactory, SessionStoreFactory } from '@datadog/browser-core'
import { createShopifyCookieAccess } from './shopifyCookieAccess'
import type { ShopifyBrowserApi } from './webPixelUtils'

let shopifyBrowserApi: ShopifyBrowserApi | undefined

export function setShopifyBrowserApi(api: ShopifyBrowserApi | undefined) {
  shopifyBrowserApi = api
}

/**
 * Shares the storefront session through the Web Pixel `browser.cookie` API, the only way to reach
 * cookies from the app pixel worker. Falls back to an isolated in-memory session when the browser
 * API is not provided or can't persist cookies.
 */
export const createShopifySessionStore: SessionStoreFactory = async (configuration) => {
  const browser = shopifyBrowserApi
  if (!browser) {
    return initMemorySessionStoreStrategy()
  }

  const createAccess: CookieAccessFactory = (cookieName, options) =>
    createShopifyCookieAccess(browser.cookie, cookieName, options)
  const cookieOptions = buildCookieOptions(configuration)
  if (!cookieOptions || !(await areCookiesAuthorized(createAccess, cookieOptions))) {
    return initMemorySessionStoreStrategy()
  }

  // Legacy-cookie migration reads document.cookie, unavailable in the pixel worker
  return createCookieSessionStore(createAccess(SESSION_STORE_KEY, cookieOptions), cookieOptions, configuration, {
    readLegacyCookie: false,
  })
}
