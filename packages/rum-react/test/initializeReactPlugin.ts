import type { RumInitConfiguration, RumPublicApi, Strategy } from '@datadog/browser-rum-core'
import type { ReactPluginConfiguration } from '../src/domain/reactPlugin'
import { reactPlugin, resetReactPlugin } from '../src/domain/reactPlugin'
import { registerCleanupTask } from '../../core/test'

export function initializeReactPlugin({
  configuration = {},
  initConfiguration = {},
  publicApi = {},
  strategy = {},
}: {
  configuration?: ReactPluginConfiguration
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
  strategy?: Partial<Strategy>
} = {}) {
  resetReactPlugin()
  const plugin = reactPlugin(configuration)

  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
  })
  plugin.onRumStart({
    strategy: strategy as Strategy,
  })

  registerCleanupTask(() => {
    resetReactPlugin()
  })
}
