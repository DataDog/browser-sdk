import type { Router } from 'vue-router'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { RumInitConfiguration, RumInternalApi, RumPublicApi } from '@datadog/browser-rum-core'
import { createFakeInternalApi } from '../../browser-rum-core/test'
import { nuxtRumPlugin, resetNuxtPlugin } from '../src/domain/nuxtPlugin'
import { registerCleanupTask } from '../../browser-core/test'

export function initializeNuxtPlugin({
  initConfiguration = {},
  publicApi = {},
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }),
  internalApi = createFakeInternalApi().internalApi,
}: {
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
  router?: Router
  internalApi?: RumInternalApi
} = {}) {
  resetNuxtPlugin()
  const plugin = nuxtRumPlugin({ router })

  plugin.onInit({
    publicApi: publicApi as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
    internalApi,
  })
  registerCleanupTask(() => resetNuxtPlugin())
}
