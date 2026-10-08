import type { Configuration } from '../../configuration'
import { buildCookieOptions } from '../../configuration'
import type { CustomCookieStore } from '../../../browser/cookieAccess'
import { areCookiesAuthorized, createCustomCookieAccess } from '../../../browser/cookieAccess'
import { createCookieSessionStore } from './sessionInCookie'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'
import type { CustomCookieSessionStoreStrategyType, SessionStoreStrategy } from './sessionStoreStrategy'

export async function selectCustomCookieStrategy(
  cookieStore: CustomCookieStore,
  configuration: Configuration
): Promise<CustomCookieSessionStoreStrategyType | undefined> {
  const cookieOptions = buildCookieOptions(configuration)
  if (
    cookieOptions &&
    (await areCookiesAuthorized(
      (cookieName, options) => createCustomCookieAccess(cookieStore, cookieName, options),
      cookieOptions
    ))
  ) {
    return { type: 'custom-cookie', cookieOptions, cookieStore }
  }
}

export function initCustomCookieStrategy(
  { cookieStore, cookieOptions }: CustomCookieSessionStoreStrategyType,
  configuration: Configuration
): SessionStoreStrategy {
  const cookieAccess = createCustomCookieAccess(cookieStore, SESSION_STORE_KEY, cookieOptions)
  return createCookieSessionStore(cookieAccess, cookieOptions, configuration)
}
