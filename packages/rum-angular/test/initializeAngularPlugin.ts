import type { RumInitConfiguration, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'
import { noop } from '@datadog/browser-core'
import { angularPlugin, resetAngularPlugin } from '../src/domain/angularPlugin'
import { registerCleanupTask } from '../../core/test'

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
