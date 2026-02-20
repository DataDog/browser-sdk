import type { RumInitConfiguration, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'
import { noop } from '@datadog/browser-core'
import type { NextjsPluginConfiguration } from '../src/domain/nextjsPlugin'
import { nextjsPlugin, resetNextjsPlugin } from '../src/domain/nextjsPlugin'
import { registerCleanupTask } from '../../core/test'

export function initializeNextjsPlugin({
  configuration = { router: 'app' as const },
  initConfiguration = {},
  publicApi = {},
  addEvent = noop,
}: {
  configuration?: NextjsPluginConfiguration
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
  addEvent?: StartRumResult['addEvent']
} = {}) {
  resetNextjsPlugin()

  const plugin = nextjsPlugin(configuration)

  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
  })

  plugin.onRumStart({
    addEvent,
  })

  registerCleanupTask(() => {
    resetNextjsPlugin()
  })
}
