import type { Hook } from '@datadog/js-core/assembly'
import type { Context } from '@datadog/js-core/util'
import { SKIPPED } from '@datadog/js-core/assembly'
import type { Configuration } from '../configuration'
import { CustomerDataType } from '../context/contextConstants'
import { storeContextManager } from '../context/storeContextManager'
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
    storeContextManager(accountContextManager, productKey, CustomerDataType.Account)
  }

  startAccountContextHook(assembleHook, accountContextManager.getContext)

  return accountContextManager
}

export function startAccountContextHook(assembleHook: Hook<any, any>, getAccount: () => Context) {
  assembleHook.register(() => {
    const account = getAccount() as Account

    if (isEmptyObject(account) || !account.id) {
      return SKIPPED
    }

    return {
      account,
    }
  })
}

export function buildAccountContextManager() {
  return createContextManager('account', {
    propertiesConfig: {
      id: { type: 'string', required: true },
      name: { type: 'string' },
    },
  })
}
