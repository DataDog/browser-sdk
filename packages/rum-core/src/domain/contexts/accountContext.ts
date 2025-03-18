import type { Account, CustomerDataTrackerManager } from '@datadog/browser-core'
import { createContextManager, CustomerDataType, display, storeContextManager } from '@datadog/browser-core'
import { HookNames } from '../../hooks'
import type { Hooks, PartialRumEvent } from '../../hooks'
import type { RumConfiguration } from '../configuration'

export type AccountContext = ReturnType<typeof startAccountContext>

export function startAccountContext(
  customerDataTrackerManager: CustomerDataTrackerManager,
  hooks: Hooks,
  configuration: RumConfiguration
) {
  const accountContextManager = buildAccountContextManager(customerDataTrackerManager)

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, accountContextManager, 'rum', CustomerDataType.Account)
  }

  hooks.register(HookNames.Assemble, ({ eventType }): PartialRumEvent | undefined => {
    const account = accountContextManager.getContext() as Account

    if (!account.id) {
      return
    }

    return {
      type: eventType,
      account,
    }
  })

  return {
    getAccount: accountContextManager.getContext,
    setAccount: accountContextManager.setContext,
    setAccountProperty: accountContextManager.setContextProperty,
    removeAccountProperty: accountContextManager.removeContextProperty,
    clearAccount: accountContextManager.clearContext,
  }
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
