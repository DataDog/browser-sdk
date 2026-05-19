import type { RumInitConfiguration, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'
import { noop } from '@datadog/browser-core'
import type { SvelteKitPluginConfiguration } from '../src/domain/sveltekitPlugin'
import { sveltekitPlugin, resetSvelteKitPlugin } from '../src/domain/sveltekitPlugin'
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
  const plugin = sveltekitPlugin(configuration)
  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
  })
  plugin.onRumStart({ addError })
  registerCleanupTask(() => resetSvelteKitPlugin())
}
