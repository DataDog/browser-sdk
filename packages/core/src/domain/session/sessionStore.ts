import type { Configuration, InitConfiguration } from '../configuration'
import { isWorkerEnvironment } from '../../tools/globalObject'
import { display } from '../../tools/display'
import { SessionPersistence } from './sessionConstants'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './storeStrategies/sessionStoreStrategy'
import { selectCookieStrategy, initCookieStrategy } from './storeStrategies/sessionInCookie'
import { selectLocalStorageStrategy, initLocalStorageStrategy } from './storeStrategies/sessionInLocalStorage'
import { selectMemorySessionStoreStrategy, initMemorySessionStoreStrategy } from './storeStrategies/sessionInMemory'

/**
 * Selects the correct session store strategy type based on the configuration and storage
 * availability. When an array is provided, tries each persistence type in order until one
 * successfully initializes.
 */
export function selectSessionStoreStrategyType(
  initConfiguration: InitConfiguration
): SessionStoreStrategyType | undefined {
  const { sessionPersistence } = initConfiguration

  const persistenceList = normalizePersistenceList(sessionPersistence)

  for (const persistence of persistenceList) {
    const strategyType = selectStrategyForPersistence(persistence, initConfiguration)
    if (strategyType !== undefined) {
      return strategyType
    }
  }

  return undefined
}

function normalizePersistenceList(
  sessionPersistence: SessionPersistence | SessionPersistence[] | undefined
): SessionPersistence[] {
  if (Array.isArray(sessionPersistence)) {
    return sessionPersistence
  }
  if (sessionPersistence !== undefined) {
    return [sessionPersistence]
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
  persistence: SessionPersistence,
  initConfiguration: InitConfiguration
): SessionStoreStrategyType | undefined {
  switch (persistence) {
    case SessionPersistence.COOKIE:
      return selectCookieStrategy(initConfiguration)

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
      return initCookieStrategy(sessionStoreStrategyType.cookieOptions, configuration)
    case SessionPersistence.LOCAL_STORAGE:
      return initLocalStorageStrategy(configuration)
    case SessionPersistence.MEMORY:
      return initMemorySessionStoreStrategy()
  }
}
