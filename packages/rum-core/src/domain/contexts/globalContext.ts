import type { CustomerDataTrackerManager } from '@datadog/browser-core'
import { createContextManager, CustomerDataType, storeContextManager } from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import type { Hooks, PartialRumEvent } from '../../hooks'
import { HookNames } from '../../hooks'

export function startGlobalContext(
  hooks: Hooks,
  customerDataTrackerManager: CustomerDataTrackerManager,
  configuration: RumConfiguration
) {
  const globalContextManager = buildGlobalContextManager(customerDataTrackerManager)

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, globalContextManager, 'rum', CustomerDataType.GlobalContext)
  }

  hooks.register(HookNames.Assemble, ({ eventType }): PartialRumEvent | undefined => ({
    type: eventType,
    context: globalContextManager.getContext(),
  }))

  return globalContextManager
}

export function buildGlobalContextManager(customerDataTrackerManager: CustomerDataTrackerManager) {
  return createContextManager('global context', {
    customerDataTracker: customerDataTrackerManager.getOrCreateTracker(CustomerDataType.GlobalContext),
  })
}
