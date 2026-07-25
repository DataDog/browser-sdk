import type { RumPlugin, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'
import type { Router } from 'vue-router'
import { startTrackingNuxtViews } from './router/nuxtRouter'
import type { NuxtApp } from './error/setupNuxtErrorHandling'
import { reportNuxtError, setupNuxtErrorHandling } from './error/setupNuxtErrorHandling'

/**
 * Nuxt plugin type.
 *
 * The plugins API is unstable and experimental, and may change without notice. Please don't use this type directly.
 *
 * @internal
 */
export type NuxtPlugin = Pick<Required<RumPlugin>, 'name' | 'onInit' | 'onRumStart' | 'getConfigurationTelemetry'>

/**
 * Nuxt plugin configuration.
 *
 * @category Main
 */
export interface NuxtPluginConfiguration {
  /**
   * The Vue Router instance used by the Nuxt application, used to automatically track route
   * changes as RUM views.
   */
  router: Router
  /**
   * The Nuxt app instance, used to automatically report Vue component errors and Nuxt startup
   * errors caught by the `app:error` hook. Optional, but recommended.
   */
  nuxtApp?: NuxtApp
}

type InitSubscriber = (rumPublicApi: RumPublicApi) => void
type StartSubscriber = (addError: StartRumResult['addError']) => void

let globalPublicApi: RumPublicApi | undefined
let globalAddError: StartRumResult['addError'] | undefined

const onRumInitSubscribers: InitSubscriber[] = []
const onRumStartSubscribers: StartSubscriber[] = []

/**
 * Nuxt plugin constructor.
 *
 * @category Main
 * @example
 * ```ts
 * import { datadogRum } from '@datadog/browser-rum'
 * import { nuxtRumPlugin } from '@datadog/browser-rum-nuxt'
 * import { defineNuxtPlugin, useNuxtApp, useRouter } from 'nuxt/app'
 *
 * export default defineNuxtPlugin({
 *   name: 'datadog-rum',
 *   enforce: 'pre',
 *   setup() {
 *     datadogRum.init({
 *       applicationId: '<DATADOG_APPLICATION_ID>',
 *       clientToken: '<DATADOG_CLIENT_TOKEN>',
 *       site: '<DATADOG_SITE>',
 *       plugins: [
 *         nuxtRumPlugin({
 *           router: useRouter(),
 *           nuxtApp: useNuxtApp(),
 *         }),
 *       ],
 *     })
 *   },
 * })
 * ```
 */
export function nuxtRumPlugin(configuration: NuxtPluginConfiguration): NuxtPlugin {
  return {
    name: 'nuxt',
    onInit({ publicApi, initConfiguration }) {
      globalPublicApi = publicApi
      initConfiguration.trackViewsManually = true
      startTrackingNuxtViews(publicApi, configuration.router)
      if (configuration.nuxtApp) {
        setupNuxtErrorHandling(configuration.nuxtApp, (error, instance, info) => {
          onRumStart((addError) => {
            reportNuxtError(addError, error, instance, info)
          })
        })
      }

      for (const subscriber of onRumInitSubscribers) {
        subscriber(publicApi)
      }
    },
    onRumStart({ addError }) {
      globalAddError = addError
      if (addError) {
        for (const subscriber of onRumStartSubscribers) {
          subscriber(addError)
        }
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

export function onRumStart(callback: StartSubscriber) {
  if (globalAddError) {
    callback(globalAddError)
  } else {
    onRumStartSubscribers.push(callback)
  }
}

export function resetNuxtPlugin() {
  globalPublicApi = undefined
  globalAddError = undefined
  onRumInitSubscribers.length = 0
  onRumStartSubscribers.length = 0
}
