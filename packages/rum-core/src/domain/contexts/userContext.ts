import type { CustomerDataTrackerManager } from '@datadog/browser-core'
import { createContextManager, CustomerDataType, storeContextManager } from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'

// export type UserContext = ReturnType<typeof startUserContext>

export function startUserContext(
  customerDataTrackerManager: CustomerDataTrackerManager,
  configuration: RumConfiguration
) {
  const userContextManager = buildUserContextManager(customerDataTrackerManager)

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, userContextManager, 'rum', CustomerDataType.User)
  }

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
