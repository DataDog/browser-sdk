import type { AbstractHooks } from '../../tools/abstractHooks'
import { CustomerDataType } from '../context/contextConstants'
import { storeContextManager } from '../context/storeContextManager'
import { HookNames } from '../../tools/abstractHooks'
import { createContextManager } from '../context/contextManager'
import type { Configuration } from '../configuration'

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
