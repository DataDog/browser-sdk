import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import type { ReactPluginConfiguration } from '../src/domain/reactPlugin'
import { reactPlugin, resetReactPlugin } from '../src/domain/reactPlugin'
import { registerCleanupTask } from '../../core/test'

export function initializeReactPlugin({
  configuration = {},
  initConfiguration = {},
  publicApi = {},
}: {
  configuration?: ReactPluginConfiguration
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
} = {}) {
  resetReactPlugin()
  const plugin = reactPlugin(configuration)

  plugin.onInit({ publicApi: publicApi as RumPublicApi, initConfiguration: initConfiguration as RumInitConfiguration })

  registerCleanupTask(() => {
    resetReactPlugin()
  })
}
