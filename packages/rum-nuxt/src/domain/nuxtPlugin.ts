import type { RumPlugin, RumPublicApi } from '@datadog/browser-rum-core'
import type { Router } from 'vue-router'
import { startTrackingNuxtViews } from './router/nuxtRouter'

export type NuxtPlugin = Pick<Required<RumPlugin>, 'name' | 'onInit' | 'getConfigurationTelemetry'>

export interface NuxtPluginConfiguration {
  router: Router
}

type InitSubscriber = (rumPublicApi: RumPublicApi) => void

let globalPublicApi: RumPublicApi | undefined

const onRumInitSubscribers: InitSubscriber[] = []

export function nuxtRumPlugin(configuration: NuxtPluginConfiguration): NuxtPlugin {
  return {
    name: 'nuxt',
    onInit({ publicApi, initConfiguration }) {
      globalPublicApi = publicApi
      initConfiguration.trackViewsManually = true
      startTrackingNuxtViews(publicApi, configuration.router)

      for (const subscriber of onRumInitSubscribers) {
        subscriber(publicApi)
      }
    },
    getConfigurationTelemetry() {
      return { router: !!configuration.router, nuxt: true }
    },
  } satisfies RumPlugin
}

export function onRumInit(callback: InitSubscriber) {
  if (globalPublicApi) {
    callback(globalPublicApi)
  } else {
    onRumInitSubscribers.push(callback)
  }
}

export function resetNuxtPlugin() {
  globalPublicApi = undefined
  onRumInitSubscribers.length = 0
}
