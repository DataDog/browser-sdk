import { version as vueVersion } from 'vue'
import { toIntegrations, toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumInternalApi, RumPlugin, RumPublicApi } from '@datadog/browser-rum-core'

let globalPublicApi: RumPublicApi | undefined
let globalConfiguration: VuePluginConfiguration | undefined
let globalInternalApi: RumInternalApi | undefined

type InitSubscriber = (
  configuration: VuePluginConfiguration,
  rumPublicApi: RumPublicApi,
  internalApi: RumInternalApi
) => void

const onRumInitSubscribers: InitSubscriber[] = []

export interface VuePluginConfiguration {
  router?: boolean
}

export type VuePlugin = Required<RumPlugin>

export function vuePlugin(configuration: VuePluginConfiguration = {}): VuePlugin {
  return {
    name: 'vue',
    onInit({ publicApi, initConfiguration, internalApi }) {
      globalPublicApi = publicApi
      globalConfiguration = configuration
      globalInternalApi = internalApi
      for (const subscriber of onRumInitSubscribers) {
        subscriber(globalConfiguration, globalPublicApi, internalApi)
      }
      if (configuration.router) {
        initConfiguration.trackViewsManually = true
      }
    },
    getConfigurationTelemetry() {
      const vueIntegration = toMajorVersionIntegration('vue', vueVersion)
      return {
        router: !!configuration.router,
        integrations: toIntegrations(vueIntegration, configuration.router && 'vue-router'),
      }
    },
  } satisfies RumPlugin
}

export function onRumInit(callback: InitSubscriber) {
  if (globalConfiguration && globalPublicApi && globalInternalApi) {
    callback(globalConfiguration, globalPublicApi, globalInternalApi)
  } else {
    onRumInitSubscribers.push(callback)
  }
}

export function resetVuePlugin() {
  globalPublicApi = undefined
  globalConfiguration = undefined
  globalInternalApi = undefined
  onRumInitSubscribers.length = 0
}
