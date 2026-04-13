import type { Router } from 'vue-router'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { RumInitConfiguration, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'
import { noop } from '@datadog/browser-core'
import { nuxtRumPlugin, resetNuxtPlugin } from '../src/domain/nuxtPlugin'
import { registerCleanupTask } from '../../core/test'

export function initializeNuxtPlugin({
  initConfiguration = {},
  publicApi = {},
  addError = noop,
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }),
}: {
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
  addError?: StartRumResult['addError']
  router?: Router
} = {}) {
  resetNuxtPlugin()
  const plugin = nuxtRumPlugin({ router })

  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
  })
  plugin.onRumStart({
    addError,
  })
  registerCleanupTask(() => resetNuxtPlugin())
}
