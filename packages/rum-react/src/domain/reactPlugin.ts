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
 * Factory returning the react plugin to pass to datadogRum.init({ plugins: [...] }).
 *
 * The plugin wires React-specific features such as:
 * - ErrorBoundary integration (errors forwarded as RUM *Error* events)
 * - Optional react-router view tracking
 * - Component performance tracking utilities (see {@link UNSTABLE_ReactComponentTracker}).
 *
 *
 * @param configuration React plugin specific configuration.
 * @returns A RUM plugin instance to include in the SDK init.
 * @public
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
