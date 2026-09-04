import type {
  RumInitConfiguration,
  RumPublicApi,
  StartRumResult,
  RumPluginOnInitOptions,
} from '@datadog/browser-rum-core'
import { noop } from '@datadog/browser-core'
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
  // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
  plugin.onInit({
    publicApi,
    initConfiguration,
  } as RumPluginOnInitOptions)
  plugin.onRumStart({ addError })
  registerCleanupTask(() => resetVuePlugin())
}
