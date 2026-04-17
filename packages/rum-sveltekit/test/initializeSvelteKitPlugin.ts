import type { RumInitConfiguration, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'
import { noop } from '@datadog/browser-core'
import type { SvelteKitPluginConfiguration } from '../src/domain/svelteKitPlugin'
import { svelteKitPlugin, resetSvelteKitPlugin } from '../src/domain/svelteKitPlugin'
import { registerCleanupTask } from '../../core/test'

export function initializeSvelteKitPlugin({
  configuration = {},
  initConfiguration = {},
  publicApi = {},
  addError = noop,
}: {
  configuration?: SvelteKitPluginConfiguration
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
  addError?: StartRumResult['addError']
} = {}) {
  resetSvelteKitPlugin()
  const plugin = svelteKitPlugin(configuration)
  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
  })
  plugin.onRumStart({ addError })
  registerCleanupTask(() => resetSvelteKitPlugin())
}
