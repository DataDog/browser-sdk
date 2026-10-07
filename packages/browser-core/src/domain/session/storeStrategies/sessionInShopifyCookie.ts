import type { Configuration } from '../../configuration'
import { buildCookieOptions } from '../../configuration'
import { areCookiesAuthorized } from '../../../browser/cookieAccess'
import { createCookieSessionStore } from './sessionInCookie'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'
import type { ShopifySessionStoreStrategyType, SessionStoreStrategy } from './sessionStoreStrategy'

export async function selectShopifyCookieStrategy(
  configuration: Configuration
): Promise<ShopifySessionStoreStrategyType | undefined> {
  const cookieOptions = buildCookieOptions(configuration)
  if (cookieOptions && (await areCookiesAuthorized(configuration.shopifyCookieAccessFactory!, cookieOptions))) {
    return { type: 'shopify', cookieOptions }
  }
}

export function initShopifyCookieStrategy(
  { cookieOptions }: ShopifySessionStoreStrategyType,
  configuration: Configuration
): SessionStoreStrategy {
  const cookieAccess = configuration.shopifyCookieAccessFactory!(SESSION_STORE_KEY, cookieOptions)
  // The legacy cookie is read through `document.cookie`, which is not available in the Web Pixel worker
  return createCookieSessionStore(cookieAccess, cookieOptions, configuration, { readLegacyCookie: false })
}
