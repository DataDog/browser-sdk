import { toIntegrations, toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumInternalApi, RumPlugin, RumPublicApi } from '@datadog/browser-rum-core'
import type { Router } from 'vue-router'
import { startTrackingNuxtViews } from './router/nuxtRouter'
import type { NuxtApp } from './error/setupNuxtErrorHandling'
import { reportNuxtError, setupNuxtErrorHandling } from './error/setupNuxtErrorHandling'

export type NuxtPlugin = Pick<Required<RumPlugin>, 'name' | 'onInit' | 'getConfigurationTelemetry'>

export interface NuxtPluginConfiguration {
  router: Router
  nuxtApp?: NuxtApp
}

type InitSubscriber = (rumPublicApi: RumPublicApi, internalApi: RumInternalApi) => void

let globalPublicApi: RumPublicApi | undefined
let globalInternalApi: RumInternalApi | undefined

const onRumInitSubscribers: InitSubscriber[] = []

export function nuxtRumPlugin(configuration: NuxtPluginConfiguration): NuxtPlugin {
  return {
    name: 'nuxt',
    onInit({ publicApi, initConfiguration, internalApi }) {
      globalPublicApi = publicApi
      globalInternalApi = internalApi
      initConfiguration.trackViewsManually = true
      startTrackingNuxtViews(publicApi, configuration.router)
      if (configuration.nuxtApp) {
        setupNuxtErrorHandling(configuration.nuxtApp, (error, instance, info) => {
          onRumInit((_rumPublicApi, internalApi) => {
            reportNuxtError(internalApi, error, instance, info)
          })
        })
      }

      for (const subscriber of onRumInitSubscribers) {
        subscriber(publicApi, internalApi)
      }
    },
    getConfigurationTelemetry() {
      return {
        router: !!configuration.router,
        integrations: toIntegrations(
          toMajorVersionIntegration('nuxt', configuration.nuxtApp?.versions?.nuxt),
          'nuxt-router'
        ),
      }
    },
  } satisfies RumPlugin
}

export function onRumInit(callback: InitSubscriber) {
  if (globalPublicApi && globalInternalApi) {
    callback(globalPublicApi, globalInternalApi)
  } else {
    onRumInitSubscribers.push(callback)
  }
}

export function resetNuxtPlugin() {
  globalPublicApi = undefined
  globalInternalApi = undefined
  onRumInitSubscribers.length = 0
}
