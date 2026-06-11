import type { Configuration } from '../configuration'
import { CustomerDataType } from '../context/contextConstants'
import { storeContextManager } from '../context/storeContextManager'
import type { Hook } from '../../tools/abstractHooks'
import { SKIPPED } from '../../tools/abstractHooks'
import { isEmptyObject } from '../../tools/utils/objectUtils'
import { createContextManager } from '../context/contextManager'

/**
 * Account information for the browser SDK.
 */
export interface Account {
  id: string
  name?: string | undefined
  [key: string]: unknown
}

export function startAccountContext(assembleHook: Hook<any, any>, configuration: Configuration, productKey: string) {
  const accountContextManager = buildAccountContextManager()

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, accountContextManager, productKey, CustomerDataType.Account)
  }

  assembleHook.register(() => {
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
