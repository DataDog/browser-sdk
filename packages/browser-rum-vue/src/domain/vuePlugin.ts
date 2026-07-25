import type { RumPlugin, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'

let globalPublicApi: RumPublicApi | undefined
let globalConfiguration: VuePluginConfiguration | undefined
let globalAddError: StartRumResult['addError'] | undefined

type InitSubscriber = (configuration: VuePluginConfiguration, rumPublicApi: RumPublicApi) => void
type StartSubscriber = (addError: StartRumResult['addError']) => void

const onRumInitSubscribers: InitSubscriber[] = []
const onRumStartSubscribers: StartSubscriber[] = []

/**
 * Vue plugin configuration.
 *
 * @category Main
 */
export interface VuePluginConfiguration {
  /**
   * Enable Vue Router integration. Make sure to use `createRouter()` from
   * {@link @datadog/browser-rum-vue/vue-router-v4! | @datadog/browser-rum-vue/vue-router-v4}
   * to create the router.
   */
  router?: boolean
}

/**
 * Vue plugin type.
 *
 * The plugins API is unstable and experimental, and may change without notice. Please don't use this type directly.
 *
 * @internal
 */
export type VuePlugin = Required<RumPlugin>

/**
 * Vue plugin constructor.
 *
 * @category Main
 * @example
 * ```ts
 * import { datadogRum } from '@datadog/browser-rum'
 * import { vuePlugin } from '@datadog/browser-rum-vue'
 *
 * datadogRum.init({
 *   applicationId: '<DATADOG_APPLICATION_ID>',
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   site: '<DATADOG_SITE>',
 *   plugins: [vuePlugin()],
 *   // ...
 * })
 * ```
 */
export function vuePlugin(configuration: VuePluginConfiguration = {}): VuePlugin {
  return {
    name: 'vue',
    onInit({ publicApi, initConfiguration }) {
      globalPublicApi = publicApi
      globalConfiguration = configuration
      for (const subscriber of onRumInitSubscribers) {
        subscriber(globalConfiguration, globalPublicApi)
      }
      if (configuration.router) {
        initConfiguration.trackViewsManually = true
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
      return { router: !!configuration.router }
    },
  } satisfies RumPlugin
}

export function onRumInit(callback: InitSubscriber) {
  if (globalConfiguration && globalPublicApi) {
    callback(globalConfiguration, globalPublicApi)
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

export function resetVuePlugin() {
  globalPublicApi = undefined
  globalConfiguration = undefined
  globalAddError = undefined
  onRumInitSubscribers.length = 0
  onRumStartSubscribers.length = 0
}
