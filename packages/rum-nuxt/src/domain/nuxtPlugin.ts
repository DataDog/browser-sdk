import type { RumPlugin } from '@datadog/browser-rum-core'
import type { AppConfig } from 'vue'
import type { Router } from 'vue-router'
import { startTrackingNuxtViews } from './router/nuxtRouter'
import { addNuxtAppError } from './error/addNuxtAppError'
import { addNuxtError } from './error/addNuxtError'
import { setRumAddError, setRumPublicApi } from './nuxtPluginBus'

export type { InitSubscriber, StartSubscriber } from './nuxtPluginBus'
export { onRumInit, onRumStart, resetNuxtPlugin } from './nuxtPluginBus'

export type NuxtPlugin = Pick<Required<RumPlugin>, 'name' | 'onInit' | 'onRumStart' | 'getConfigurationTelemetry'>

interface NuxtApp {
  vueApp: {
    config: Pick<AppConfig, 'errorHandler'>
  }
  hook(name: 'app:error', fn: (error: unknown) => void): void
}

export interface NuxtPluginConfiguration {
  router: Router
  nuxtApp?: NuxtApp
}

export function nuxtRumPlugin(configuration: NuxtPluginConfiguration): NuxtPlugin {
  return {
    name: 'nuxt',
    onInit({ publicApi, initConfiguration }) {
      initConfiguration.trackViewsManually = true
      startTrackingNuxtViews(publicApi, configuration.router)
      if (configuration.nuxtApp) {
        startTrackingNuxtErrors(configuration.nuxtApp)
      }
      setRumPublicApi(publicApi)
    },
    onRumStart({ addError }) {
      if (addError) {
        setRumAddError(addError)
      }
    },
    getConfigurationTelemetry() {
      return { router: !!configuration.router, nuxt: true }
    },
  } satisfies RumPlugin
}

function startTrackingNuxtErrors(nuxtApp: NuxtApp) {
  const seenErrors = new WeakSet<object>()

  const previousErrorHandler = nuxtApp.vueApp.config.errorHandler
  nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
    if (error && typeof error === 'object') {
      seenErrors.add(error)
    }
    addNuxtError(error, instance, info)
    previousErrorHandler?.(error, instance, info)
  }

  nuxtApp.hook('app:error', (error) => {
    if (error && typeof error === 'object' && seenErrors.has(error)) {
      return
    }
    addNuxtAppError(error)
  })
}
