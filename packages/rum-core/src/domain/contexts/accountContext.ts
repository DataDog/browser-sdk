import type { CustomerDataTrackerManager } from '@datadog/browser-core'
import { createContextManager, CustomerDataType, storeContextManager } from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'

// export type AccountContext = ReturnType<typeof startAccountContext>

export function startAccountContext(
  customerDataTrackerManager: CustomerDataTrackerManager,
  configuration: RumConfiguration
) {
  const accountContextManager = buildAccountContextManager(customerDataTrackerManager)

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, accountContextManager, 'rum', CustomerDataType.Account)
  }

  return accountContextManager
}

export function buildAccountContextManager(customerDataTrackerManager: CustomerDataTrackerManager) {
  return createContextManager('account', {
    customerDataTracker: customerDataTrackerManager.getOrCreateTracker(CustomerDataType.Account),
    propertiesConfig: {
      id: { type: 'string', required: true },
      name: { type: 'string' },
    },
  })
}
