import type { RumInitConfiguration, RumPublicApi, StartRumResult } from '@openobserve/browser-rum-core'
import { noop } from '@openobserve/browser-core'
import { nextjsPlugin, resetNextjsPlugin } from '../src/domain/nextjsPlugin'
import { registerCleanupTask } from '../../browser-core/test'

export function initializeNextjsPlugin({
  initConfiguration = {},
  publicApi = {},
  addError = noop,
}: {
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
  addError?: StartRumResult['addError']
} = {}) {
  resetNextjsPlugin()
  const plugin = nextjsPlugin()

  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
  })
  plugin.onRumStart({
    addError,
  })

  registerCleanupTask(() => {
    resetNextjsPlugin()
  })
}
