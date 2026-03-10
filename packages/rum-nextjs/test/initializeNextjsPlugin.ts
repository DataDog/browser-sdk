import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../core/test'
import { nextjsPlugin, resetNextjsPlugin } from '../src/domain/nextjsPlugin'

export function initializeNextjsPlugin() {
  const startViewSpy = jasmine.createSpy('startView')
  const plugin = nextjsPlugin()
  plugin.onInit({
    publicApi: { startView: startViewSpy } as unknown as RumPublicApi,
    initConfiguration: {} as RumInitConfiguration,
  })
  registerCleanupTask(() => resetNextjsPlugin())
  return startViewSpy
}
