import type { RumInitConfiguration, RumInternalApi, RumPublicApi } from '@datadog/browser-rum-core'
import { createFakeInternalApi } from '../../browser-rum-core/test'
import { angularPlugin, resetAngularPlugin } from '../src/domain/angularPlugin'
import { registerCleanupTask } from '../../browser-core/test'

export function initializeAngularPlugin({
  internalApi = createFakeInternalApi().internalApi,
}: {
  internalApi?: RumInternalApi
} = {}) {
  resetAngularPlugin()
  const plugin = angularPlugin()

  plugin.onInit!({
    publicApi: {} as RumPublicApi,
    initConfiguration: {} as RumInitConfiguration,
    internalApi,
  })

  registerCleanupTask(() => {
    resetAngularPlugin()
  })
}
