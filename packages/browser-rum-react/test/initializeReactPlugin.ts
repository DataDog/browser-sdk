import type { RumInitConfiguration, RumPublicApi, RumInternalApi } from '@datadog/browser-rum-core'
import { createFakeInternalApi } from '../../browser-rum-core/test'
import type { ReactPluginConfiguration } from '../src/domain/reactPlugin'
import { reactPlugin, resetReactPlugin } from '../src/domain/reactPlugin'
import { registerCleanupTask } from '../../browser-core/test'

export function initializeReactPlugin({
  configuration = {},
  initConfiguration = {},
  publicApi = {},
  internalApi = createFakeInternalApi().internalApi,
}: {
  configuration?: ReactPluginConfiguration
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
  internalApi?: RumInternalApi
} = {}) {
  resetReactPlugin()
  const plugin = reactPlugin(configuration)

  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
    internalApi,
  })

  registerCleanupTask(() => {
    resetReactPlugin()
  })
}
