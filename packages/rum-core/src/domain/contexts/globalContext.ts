import type { CustomerDataTrackerManager } from '@datadog/browser-core'
import { createContextManager, CustomerDataType, storeContextManager } from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'

export type GlobalContext = ReturnType<typeof startGlobalContext>

export function startGlobalContext(
  customerDataTrackerManager: CustomerDataTrackerManager,
  configuration: RumConfiguration
) {
  const globalContextManager = buildGlobalContextManager(customerDataTrackerManager)

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, globalContextManager, 'rum', CustomerDataType.GlobalContext)
  }

  return {
    getGlobalContext: globalContextManager.getContext,
    setGlobalContext: globalContextManager.setContext,
    setGlobalContextProperty: globalContextManager.setContextProperty,
    removeGlobalContextProperty: globalContextManager.removeContextProperty,
    clearGlobalContext: globalContextManager.clearContext,
  }
}

export function buildGlobalContextManager(customerDataTrackerManager: CustomerDataTrackerManager) {
  return createContextManager('global context', {
    customerDataTracker: customerDataTrackerManager.getOrCreateTracker(CustomerDataType.GlobalContext),
  })
}
