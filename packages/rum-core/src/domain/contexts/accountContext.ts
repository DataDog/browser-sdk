import type { Account } from '@datadog/browser-core'
import { createContextManager, CustomerDataType, isEmptyObject, storeContextManager } from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import type { Hooks, PartialRumEvent } from '../../hooks'
import { SKIPPED, HookNames } from '../../hooks'

export function startAccountContext(hooks: Hooks, configuration: RumConfiguration) {
  const accountContextManager = buildAccountContextManager()

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, accountContextManager, 'rum', CustomerDataType.Account)
  }

  hooks.register(HookNames.Assemble, ({ eventType }): PartialRumEvent | SKIPPED => {
    const account = accountContextManager.getContext() as Account

    if (isEmptyObject(account) || !account.id) {
      return SKIPPED
    }

    return {
      type: eventType,
      account,
    }
  })

  return accountContextManager
}

export function buildAccountContextManager() {
  return createContextManager('account', {
    propertiesConfig: {
      id: { type: 'string', required: true },
      name: { type: 'string' },
    },
  })
}
