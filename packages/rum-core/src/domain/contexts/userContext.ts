import type { CustomerDataTrackerManager } from '@datadog/browser-core'
import { createContextManager, CustomerDataType, isEmptyObject, storeContextManager } from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import type { Hooks, PartialRumEvent } from '../../hooks'
import { HookNames } from '../../hooks'
import type { RumSessionManager } from '../rumSessionManager'

export function startUserContext(
  hooks: Hooks,
  customerDataTrackerManager: CustomerDataTrackerManager,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager
) {
  const userContextManager = buildUserContextManager(customerDataTrackerManager)

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, userContextManager, 'rum', CustomerDataType.User)
  }

  hooks.register(HookNames.Assemble, ({ eventType, startTime }): PartialRumEvent | undefined => {
    const user = userContextManager.getContext()
    const session = sessionManager.findTrackedSession(startTime)

    if (session && session.anonymousId && !user.anonymous_id && !!configuration.trackAnonymousUser) {
      user.anonymous_id = session.anonymousId
    }

    if (isEmptyObject(user)) {
      return
    }

    return {
      type: eventType,
      usr: user,
    }
  })

  return userContextManager
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
