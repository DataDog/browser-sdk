import type { RumInitConfiguration, RumPublicApi, StartRumResult } from '@openobserve/browser-rum-core'
import { noop } from '@openobserve/browser-core'
import { angularPlugin, resetAngularPlugin } from '../src/domain/angularPlugin'
import { registerCleanupTask } from '../../browser-core/test'

export function initializeAngularPlugin({
  addError = noop,
}: {
  addError?: StartRumResult['addError']
} = {}) {
  resetAngularPlugin()
  const plugin = angularPlugin()

  plugin.onInit!({
    publicApi: {} as RumPublicApi,
    initConfiguration: {} as RumInitConfiguration,
  })
  plugin.onRumStart!({ addError })

  registerCleanupTask(() => {
    resetAngularPlugin()
  })
}
