import type { RumInitConfiguration, RumInternalApi, RumPublicApi } from '@datadog/browser-rum-core'
import { createFakeInternalApi } from '../../browser-rum-core/test'
import { nextjsPlugin, resetNextjsPlugin } from '../src/domain/nextjsPlugin'
import { registerCleanupTask } from '../../browser-core/test'

export function initializeNextjsPlugin({
  initConfiguration = {},
  publicApi = {},
  internalApi = createFakeInternalApi().internalApi,
}: {
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
  internalApi?: RumInternalApi
} = {}) {
  resetNextjsPlugin()
  const plugin = nextjsPlugin()

  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
    internalApi,
  })

  registerCleanupTask(() => {
    resetNextjsPlugin()
  })
}
