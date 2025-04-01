import type { Account, CustomerDataTrackerManager } from '@datadog/browser-core'
import { createContextManager, CustomerDataType, isEmptyObject, storeContextManager } from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import type { Hooks, PartialRumEvent } from '../../hooks'
import { HookNames } from '../../hooks'

export function startAccountContext(
  hooks: Hooks,
  customerDataTrackerManager: CustomerDataTrackerManager,
  configuration: RumConfiguration
) {
  const accountContextManager = buildAccountContextManager(customerDataTrackerManager)

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, accountContextManager, 'rum', CustomerDataType.Account)
  }

  hooks.register(HookNames.Assemble, ({ eventType }): PartialRumEvent | undefined => {
    const account = accountContextManager.getContext()

    if (isEmptyObject(account) || !account.id) {
      return
    }

    return {
      type: eventType,
      account: accountContextManager.getContext() as Account,
    }
  })

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
