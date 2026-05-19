import type { RumInitConfiguration, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'
import { noop } from '@datadog/browser-core'
import type { SolidPluginConfiguration } from '../src/domain/solidPlugin'
import { solidPlugin, resetSolidPlugin } from '../src/domain/solidPlugin'
import { registerCleanupTask } from '../../core/test'

export function initializeSolidPlugin({
  configuration = {},
  initConfiguration = {},
  publicApi = {},
  addError = noop,
}: {
  configuration?: SolidPluginConfiguration
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
  addError?: StartRumResult['addError']
} = {}) {
  resetSolidPlugin()
  const plugin = solidPlugin(configuration)

  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
  })
  plugin.onRumStart({
    addError,
  })

  registerCleanupTask(() => {
    resetSolidPlugin()
  })
}
