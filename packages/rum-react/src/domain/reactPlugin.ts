import type { RumPlugin, RumPublicApi } from '@datadog/browser-rum-core'

let globalPublicApi: RumPublicApi | undefined
let globalConfiguration: ReactPluginConfiguration | undefined
type Subscriber = (configuration: ReactPluginConfiguration, rumPublicApi: RumPublicApi) => void

const onReactPluginInitSubscribers: Subscriber[] = []

export interface ReactPluginConfiguration {
  /**
   * Enable react-router integration
   */
  router?: boolean
}

export function reactPlugin(configuration: ReactPluginConfiguration = {}) {
  return {
    name: 'react',
    onInit({ publicApi, initConfiguration }) {
      globalPublicApi = publicApi
      globalConfiguration = configuration
      onReactPluginInitSubscribers.forEach((subscriber) => subscriber(configuration, publicApi))
      if (configuration.router) {
        initConfiguration.trackViewsManually = true
      }
    },
    getConfigurationTelemetry() {
      return { router: !!configuration.router }
    },
  } satisfies RumPlugin
}

export function onReactPluginInit(callback: Subscriber) {
  if (globalConfiguration && globalPublicApi) {
    callback(globalConfiguration, globalPublicApi)
  } else {
    onReactPluginInitSubscribers.push(callback)
  }
}

export function resetReactPlugin() {
  globalPublicApi = undefined
  globalConfiguration = undefined
  onReactPluginInitSubscribers.length = 0
}
