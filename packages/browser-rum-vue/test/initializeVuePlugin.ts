import type { RumInitConfiguration, RumPublicApi, StartRumResult } from '@openobserve/browser-rum-core'
import { noop } from '@openobserve/browser-core'
import type { VuePluginConfiguration } from '../src/domain/vuePlugin'
import { vuePlugin, resetVuePlugin } from '../src/domain/vuePlugin'
import { registerCleanupTask } from '../../browser-core/test'

export function initializeVuePlugin({
  configuration = {},
  initConfiguration = {},
  publicApi = {},
  addError = noop,
}: {
  configuration?: VuePluginConfiguration
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
  addError?: StartRumResult['addError']
} = {}) {
  resetVuePlugin()
  const plugin = vuePlugin(configuration)
  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
  })
  plugin.onRumStart({ addError })
  registerCleanupTask(() => resetVuePlugin())
}
