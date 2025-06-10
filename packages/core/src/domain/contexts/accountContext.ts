import type { Configuration } from '../configuration'
import { CustomerDataType } from '../context/contextConstants'
import { storeContextManager } from '../context/storeContextManager'
import { HookNames, SKIPPED } from '../../tools/abstractHooks'
import type { AbstractHooks } from '../../tools/abstractHooks'
import { isEmptyObject } from '../../tools/utils/objectUtils'
import { createContextManager } from '../context/contextManager'

export interface Account {
  id: string
  name?: string | undefined
  [key: string]: unknown
}

export function startAccountContext(hooks: AbstractHooks, configuration: Configuration, productKey: string) {
  const accountContextManager = buildAccountContextManager()

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, accountContextManager, productKey, CustomerDataType.Account)
  }

  hooks.register(HookNames.Assemble, () => {
    const account = accountContextManager.getContext() as Account

    if (isEmptyObject(account) || !account.id) {
      return SKIPPED
    }

    return {
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
