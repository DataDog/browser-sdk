import type { CustomerDataTrackerManager } from '@datadog/browser-core'
import { createContextManager, CustomerDataType, storeContextManager } from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'

export function startGlobalContext(
  customerDataTrackerManager: CustomerDataTrackerManager,
  configuration: RumConfiguration
) {
  const globalContextManager = buildGlobalContextManager(customerDataTrackerManager)

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, globalContextManager, 'rum', CustomerDataType.GlobalContext)
  }

  return globalContextManager
}

export function buildGlobalContextManager(customerDataTrackerManager: CustomerDataTrackerManager) {
  return createContextManager('global context', {
    customerDataTracker: customerDataTrackerManager.getOrCreateTracker(CustomerDataType.GlobalContext),
  })
}
