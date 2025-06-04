import { createContextManager, CustomerDataType, HookNames, storeContextManager } from '@datadog/browser-core'
import type { Hooks } from '../hooks'
import type { LogsConfiguration } from '../configuration'

export function startGlobalContext(hooks: Hooks, configuration: LogsConfiguration) {
  const globalContextManager = buildGlobalContextManager()

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, globalContextManager, 'logs', CustomerDataType.GlobalContext)
  }

  hooks.register(HookNames.Assemble, () => globalContextManager.getContext())

  return globalContextManager
}

export function buildGlobalContextManager() {
  return createContextManager('global context')
}
