import type { Hook } from '@openobserve/js-core/assembly'
import { CustomerDataType } from '../context/contextConstants'
import { storeContextManager } from '../context/storeContextManager'
import { createContextManager } from '../context/contextManager'
import type { Configuration } from '../configuration'

export function startGlobalContext(
  assembleHook: Hook<any, any>,
  configuration: Configuration,
  productKey: string,
  useContextNamespace: boolean
) {
  const globalContextManager = buildGlobalContextManager()

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(globalContextManager, productKey, CustomerDataType.GlobalContext)
  }

  assembleHook.register(() => {
    const context = globalContextManager.getContext()
    return useContextNamespace ? { context } : context
  })

  return globalContextManager
}

export function buildGlobalContextManager() {
  return createContextManager('global context')
}
