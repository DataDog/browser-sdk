import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import type { SveltekitPluginConfiguration } from '../src/domain/sveltekitPlugin'
import { sveltekitPlugin, resetSveltekitPlugin } from '../src/domain/sveltekitPlugin'
import { registerCleanupTask } from '../../core/test'

export function initializeSveltekitPlugin({
  configuration = {},
  initConfiguration = {},
  publicApi = {},
}: {
  configuration?: SveltekitPluginConfiguration
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
} = {}) {
  resetSveltekitPlugin()
  const plugin = sveltekitPlugin(configuration)
  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
  })
  registerCleanupTask(() => resetSveltekitPlugin())
}
