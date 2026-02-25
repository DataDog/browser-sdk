import type { Configuration } from '../configuration'
import { CustomerDataType } from '../context/contextConstants'
import { storeContextManager } from '../context/storeContextManager'
import { HookNames, SKIPPED } from '../../tools/abstractHooks'
import type { AbstractHooks } from '../../tools/abstractHooks'
import { isEmptyObject } from '../../tools/utils/objectUtils'
import { createContextManager } from '../context/contextManager'
import type { DecoratorFactory } from '@datadog/browser-core-next'

/**
 * Account information for the browser SDK.
 */
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

export function accountContextDecoratorFactory(deps: {
  getAccount: () => Account
}): DecoratorFactory<{ type: string; startTime: number }, { account?: Account }> {
  return {
    name: 'accountContext',
    provides: [],
    requires: [],
    capabilities: { canDiscard: false },
    create: () => ({
      decorate: (_event, _accumulated) => {
        const account = deps.getAccount()

        if (isEmptyObject(account) || !account.id) {
          return Promise.resolve({ status: 'skipped' as const })
        }

        return Promise.resolve({ status: 'contributed' as const, attributes: { account } })
      },
    }),
  }
}
