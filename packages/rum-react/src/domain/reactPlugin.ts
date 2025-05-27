import type { RumPlugin, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'

let globalPublicApi: RumPublicApi | undefined
let globalConfiguration: ReactPluginConfiguration | undefined
let globalAddEvent: StartRumResult['addEvent'] | undefined
type InitSubscriber = (configuration: ReactPluginConfiguration, rumPublicApi: RumPublicApi) => void
type StartSubscriber = (addEvent: StartRumResult['addEvent']) => void

const onRumInitSubscribers: InitSubscriber[] = []
const onRumStartSubscribers: StartSubscriber[] = []

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
      for (const subscriber of onRumInitSubscribers) {
        subscriber(globalConfiguration, globalPublicApi)
      }
      if (configuration.router) {
        initConfiguration.trackViewsManually = true
      }
    },
    onRumStart({ addEvent }) {
      globalAddEvent = addEvent
      for (const subscriber of onRumStartSubscribers) {
        subscriber(addEvent)
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
  if (globalAddEvent) {
    callback(globalAddEvent)
  } else {
    onRumStartSubscribers.push(callback)
  }
}

export function resetReactPlugin() {
  globalPublicApi = undefined
  globalConfiguration = undefined
  globalAddEvent = undefined
  onRumInitSubscribers.length = 0
  onRumStartSubscribers.length = 0
}
