import type { RumInitConfiguration, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'
import { noop } from '@datadog/browser-core'
import type { AngularPluginConfiguration } from '../src/domain/angularPlugin'
import { angularPlugin, resetAngularPlugin } from '../src/domain/angularPlugin'
import { registerCleanupTask } from '../../core/test'

export function initializeAngularPlugin({
  configuration = {},
  initConfiguration = {},
  publicApi = {},
  addError = noop,
}: {
  configuration?: AngularPluginConfiguration
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
  addError?: StartRumResult['addError']
} = {}) {
  resetAngularPlugin()
  const plugin = angularPlugin(configuration)
  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
  })
  plugin.onRumStart({ addError })
  registerCleanupTask(() => resetAngularPlugin())
}
