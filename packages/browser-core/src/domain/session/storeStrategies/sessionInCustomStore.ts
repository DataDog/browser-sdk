import type { Configuration } from '../../configuration'
import { buildCookieOptions } from '../../configuration'
import { areCookiesAuthorized } from '../../../browser/cookieAccess'
import { createCookieSessionStore } from './sessionInCookie'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'
import type { CustomSessionStoreStrategyType, SessionStoreStrategy } from './sessionStoreStrategy'

export async function selectCustomStrategy(
  configuration: Configuration
): Promise<CustomSessionStoreStrategyType | undefined> {
  const cookieOptions = buildCookieOptions(configuration)
  if (cookieOptions && (await areCookiesAuthorized(configuration.sessionCookieAccess!, cookieOptions))) {
    return { type: 'custom', cookieOptions }
  }
}

export function initCustomStrategy(
  { cookieOptions }: CustomSessionStoreStrategyType,
  configuration: Configuration
): SessionStoreStrategy {
  const cookieAccess = configuration.sessionCookieAccess!(SESSION_STORE_KEY, cookieOptions)
  // The legacy cookie is read through `document.cookie`, which a custom cookie access exists to avoid
  return createCookieSessionStore(cookieAccess, cookieOptions, configuration, { readLegacyCookie: false })
}
