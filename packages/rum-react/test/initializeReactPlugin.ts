import type { RumInitConfiguration, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'
import { noop } from '@datadog/browser-core'
import type { ReactPluginConfiguration } from '../src/domain/reactPlugin'
import { reactPlugin, resetReactPlugin } from '../src/domain/reactPlugin'
import { registerCleanupTask } from '../../core/test'

export function initializeReactPlugin({
  configuration = {},
  initConfiguration = {},
  publicApi = {},
  addError = noop,
}: {
  configuration?: ReactPluginConfiguration
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
  addError?: StartRumResult['addError']
} = {}) {
  resetReactPlugin()
  const plugin = reactPlugin(configuration)

  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
  })
  plugin.onRumStart({
    addError,
  })

  registerCleanupTask(() => {
    resetReactPlugin()
  })
}
