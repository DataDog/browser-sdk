import {
  SESSION_STORE_KEY,
  areCookiesAuthorized,
  buildCookieOptions,
  createCookieSessionStore,
  initMemorySessionStoreStrategy,
} from '@datadog/browser-core'
import type { SessionStoreFactory } from '@datadog/browser-core'
import { createShopifyCookieAccess } from './shopifyCookieAccess'
import type { ShopifyBrowserApi } from './webPixelUtils'

let shopifyBrowserApi: ShopifyBrowserApi | undefined

export function setShopifyBrowserApi(api: ShopifyBrowserApi | undefined) {
  shopifyBrowserApi = api
}

/**
 * Shares the storefront session through the Web Pixel `browser.cookie` API, the only way to reach
 * cookies from the app pixel worker. Falls back to an isolated in-memory session when the browser
 * API is not provided.
 */
export const createShopifySessionStore: SessionStoreFactory = async (configuration) => {
  if (!shopifyBrowserApi) {
    return initMemorySessionStoreStrategy()
  }

  const cookieOptions = buildCookieOptions(configuration)
  if (
    !cookieOptions ||
    !(await areCookiesAuthorized(
      (cookieName, options) => createShopifyCookieAccess(shopifyBrowserApi!.cookie, cookieName, options),
      cookieOptions
    ))
  ) {
    return
  }

  const cookieAccess = createShopifyCookieAccess(shopifyBrowserApi.cookie, SESSION_STORE_KEY, cookieOptions)
  // Legacy-cookie migration reads document.cookie, unavailable in the pixel worker
  return createCookieSessionStore(cookieAccess, cookieOptions, configuration, { readLegacyCookie: false })
}
