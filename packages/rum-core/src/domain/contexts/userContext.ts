import type { CustomerDataTrackerManager } from '@datadog/browser-core'
import { createContextManager, CustomerDataType, isEmptyObject, storeContextManager } from '@datadog/browser-core'
import { HookNames } from '../../hooks'
import type { Hooks, PartialRumEvent } from '../../hooks'
import type { RumSessionManager } from '../rumSessionManager'
import type { RumConfiguration } from '../configuration'

export type UserContext = ReturnType<typeof startUserContext>

export function startUserContext(
  customerDataTrackerManager: CustomerDataTrackerManager,
  hooks: Hooks,
  sessionManager: RumSessionManager,
  configuration: RumConfiguration
) {
  const userContextManager = buildUserContextManager(customerDataTrackerManager)

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, userContextManager, 'rum', CustomerDataType.User)
  }

  hooks.register(HookNames.Assemble, ({ startTime, eventType }): PartialRumEvent | undefined => {
    const user = userContextManager.getContext()
    const session = sessionManager.findTrackedSession(startTime)

    if (isEmptyObject(user)) {
      return
    }

    if (session && session.anonymousId && !user.anonymous_id && !!configuration.trackAnonymousUser) {
      user.anonymous_id = session.anonymousId
    }

    return {
      type: eventType,
      usr: user,
    }
  })

  return {
    getUser: userContextManager.getContext,
    setUser: userContextManager.setContext,
    setUserProperty: userContextManager.setContextProperty,
    removeUserProperty: userContextManager.removeContextProperty,
    clearUser: userContextManager.clearContext,
  }
}

export function buildUserContextManager(customerDataTrackerManager: CustomerDataTrackerManager) {
  return createContextManager('user', {
    customerDataTracker: customerDataTrackerManager.getOrCreateTracker(CustomerDataType.User),
    propertiesConfig: {
      id: { type: 'string' },
      name: { type: 'string' },
      email: { type: 'string' },
    },
  })
}
