import { isWorkerEnvironment } from '@datadog/js-core/util'
import type { Configuration } from '../configuration'
import type { CustomCookieStore } from '../../browser/cookieAccess'
import { display } from '../../tools/display'
import { SessionPersistence } from './sessionConstants'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './storeStrategies/sessionStoreStrategy'
import { selectCookieStrategy, initCookieStrategy } from './storeStrategies/sessionInCookie'
import { selectLocalStorageStrategy, initLocalStorageStrategy } from './storeStrategies/sessionInLocalStorage'
import { selectMemorySessionStoreStrategy, initMemorySessionStoreStrategy } from './storeStrategies/sessionInMemory'
import { selectCustomCookieStrategy, initCustomCookieStrategy } from './storeStrategies/sessionInCustomCookie'

/**
 * Selects the correct session store strategy type based on the configuration and storage
 * availability. When an array is provided, tries each persistence type in order until one
 * successfully initializes.
 */
export async function selectSessionStoreStrategyType(
  configuration: Configuration
): Promise<SessionStoreStrategyType | undefined> {
  const persistenceList = normalizePersistenceList(configuration)

  for (const persistence of persistenceList) {
    const strategyType = await selectStrategyForPersistence(persistence, configuration)
    if (strategyType !== undefined) {
      return strategyType
    }
  }

  return undefined
}

function normalizePersistenceList({
  sessionPersistence,
}: Configuration): Array<SessionPersistence | CustomCookieStore> {
  if (sessionPersistence !== undefined) {
    return sessionPersistence
  }

  // In worker environments, default to memory since cookie and localStorage are not available
  // TODO: make it work when we start using Cookie Store API
  // @see https://developer.mozilla.org/en-US/docs/Web/API/CookieStore
  if (isWorkerEnvironment) {
    return [SessionPersistence.MEMORY]
  }

  return [SessionPersistence.COOKIE]
}

function selectStrategyForPersistence(
  persistence: SessionPersistence | CustomCookieStore,
  configuration: Configuration
): Promise<SessionStoreStrategyType | undefined> | SessionStoreStrategyType | undefined {
  if (typeof persistence === 'object') {
    return selectCustomCookieStrategy(persistence, configuration)
  }

  switch (persistence) {
    case SessionPersistence.COOKIE:
      return selectCookieStrategy(configuration)

    case SessionPersistence.LOCAL_STORAGE:
      return selectLocalStorageStrategy()

    case SessionPersistence.MEMORY:
      return selectMemorySessionStoreStrategy()

    default:
      display.error(`Invalid session persistence '${String(persistence)}'`)
      return undefined
  }
}

export function getSessionStoreStrategy(
  sessionStoreStrategyType: SessionStoreStrategyType,
  configuration: Configuration
): SessionStoreStrategy {
  switch (sessionStoreStrategyType.type) {
    case SessionPersistence.COOKIE:
      return initCookieStrategy(sessionStoreStrategyType, configuration)
    case SessionPersistence.LOCAL_STORAGE:
      return initLocalStorageStrategy()
    case SessionPersistence.MEMORY:
      return initMemorySessionStoreStrategy()
    case 'custom-cookie':
      return initCustomCookieStrategy(sessionStoreStrategyType, configuration)
  }
}
