import type {
  RumInitConfiguration,
  RumPublicApi,
  StartRumResult,
  RumPluginOnInitOptions,
} from '@datadog/browser-rum-core'
import { noop } from '@datadog/browser-core'
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

  // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
  } as RumPluginOnInitOptions)
  plugin.onRumStart({
    addError,
  })

  registerCleanupTask(() => {
    resetNextjsPlugin()
  })
}
