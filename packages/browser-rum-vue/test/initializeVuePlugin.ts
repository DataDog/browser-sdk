import type { RumInitConfiguration, RumInternalApi, RumPublicApi } from '@datadog/browser-rum-core'
import { createFakeInternalApi } from '../../browser-rum-core/test'
import type { VuePluginConfiguration } from '../src/domain/vuePlugin'
import { vuePlugin, resetVuePlugin } from '../src/domain/vuePlugin'
import { registerCleanupTask } from '../../browser-core/test'

export function initializeVuePlugin({
  configuration = {},
  initConfiguration = {},
  publicApi = {},
  internalApi = createFakeInternalApi().internalApi,
}: {
  configuration?: VuePluginConfiguration
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
  internalApi?: RumInternalApi
} = {}) {
  resetVuePlugin()
  const plugin = vuePlugin(configuration)
  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
    internalApi,
  })
  registerCleanupTask(() => resetVuePlugin())
}
