import type { RumPlugin, RumPublicApi, Strategy } from '@datadog/browser-rum-core'

let globalPublicApi: RumPublicApi | undefined
let globalConfiguration: ReactPluginConfiguration | undefined
let globalStrategy: Strategy | undefined
type InitSubscriber = (configuration: ReactPluginConfiguration, rumPublicApi: RumPublicApi) => void
type StartSubscriber = (strategy: Strategy) => void

const onRumInitSubscribers: InitSubscriber[] = []
const onRumStartSubscribers: StartSubscriber[] = []

/**
 * Configuration options for the React integration plugin.
 *
 * @public
 */
export interface ReactPluginConfiguration {
  /**
   * Enable react-router integration (v6+). When set, the underlying RUM SDK
   * will switch to manual view tracking so that view updates follow your SPA
   * routing logic.
   */
  router?: boolean
}

/**
 * Factory function that creates the React plugin for Datadog RUM,
 * enabling features like ErrorBoundary integration, optional react-router view tracking,
 * and component performance tracking utilities.
 */
export function reactPlugin(configuration: ReactPluginConfiguration = {}) {
  return {
    name: 'react',
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
    onRumStart({ strategy }) {
      globalStrategy = strategy
      for (const subscriber of onRumStartSubscribers) {
        subscriber(strategy)
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
  if (globalStrategy) {
    callback(globalStrategy)
  } else {
    onRumStartSubscribers.push(callback)
  }
}

export function resetReactPlugin() {
  globalPublicApi = undefined
  globalConfiguration = undefined
  globalStrategy = undefined
  onRumInitSubscribers.length = 0
  onRumStartSubscribers.length = 0
}
