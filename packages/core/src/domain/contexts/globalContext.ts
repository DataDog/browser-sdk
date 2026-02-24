import type { AbstractHooks } from '../../tools/abstractHooks'
import { CustomerDataType } from '../context/contextConstants'
import { storeContextManager } from '../context/storeContextManager'
import { HookNames } from '../../tools/abstractHooks'
import { createContextManager } from '../context/contextManager'
import type { Configuration } from '../configuration'
import type { DecoratorFactory } from '@datadog/browser-core-next'
import type { Context } from '../../tools/serialisation/context'
import { isEmptyObject } from '../../tools/utils/objectUtils'

export function startGlobalContext(
  hooks: AbstractHooks,
  configuration: Configuration,
  productKey: string,
  useContextNamespace: boolean
) {
  const globalContextManager = buildGlobalContextManager()

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, globalContextManager, productKey, CustomerDataType.GlobalContext)
  }

  hooks.register(HookNames.Assemble, () => {
    const context = globalContextManager.getContext()
    return useContextNamespace ? { context } : context
  })

  return globalContextManager
}

export function buildGlobalContextManager() {
  return createContextManager('global context')
}

export function globalContextDecoratorFactory(deps: {
  getContext: () => Context
  useContextNamespace: boolean
}): DecoratorFactory<{ type: string; startTime: number }, Context | { context: Context }> {
  return {
    name: 'globalContext',
    provides: [],
    requires: [],
    capabilities: { canDiscard: false },
    create: () => ({
      decorate: (_event, _accumulated) => {
        const context = deps.getContext()
        if (isEmptyObject(context)) {
          return Promise.resolve({ status: 'skipped' as const })
        }
        const attributes = deps.useContextNamespace ? { context } : context
        return Promise.resolve({ status: 'contributed' as const, attributes })
      },
    }),
  }
}
