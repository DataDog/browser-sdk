import { createContextManager, CustomerDataType, storeContextManager } from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'

export function startGlobalContext(configuration: RumConfiguration) {
  const globalContextManager = buildGlobalContextManager()

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, globalContextManager, 'rum', CustomerDataType.GlobalContext)
  }

  return globalContextManager
}

export function buildGlobalContextManager() {
  return createContextManager('global context')
}
