import { createContextManager, CustomerDataType, storeContextManager } from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import type { Hooks, PartialRumEvent } from '../../hooks'
import { HookNames } from '../../hooks'

export function startGlobalContext(hooks: Hooks, configuration: RumConfiguration) {
  const globalContextManager = buildGlobalContextManager()

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, globalContextManager, 'rum', CustomerDataType.GlobalContext)
  }

  hooks.register(
    HookNames.Assemble,
    ({ eventType }): PartialRumEvent => ({
      type: eventType,
      context: globalContextManager.getContext(),
    })
  )

  return globalContextManager
}

export function buildGlobalContextManager() {
  return createContextManager('global context')
}
