import type { Router } from 'vue-router'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { nuxtRumPlugin, resetNuxtPlugin } from '../src/domain/nuxtPlugin'
import { registerCleanupTask } from '../../core/test'

export function initializeNuxtPlugin({
  initConfiguration = {},
  publicApi = {},
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }),
}: {
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
  router?: Router
} = {}) {
  resetNuxtPlugin()
  const plugin = nuxtRumPlugin({ router })

  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
  })
  registerCleanupTask(() => resetNuxtPlugin())
}
