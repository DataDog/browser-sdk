import type { RumPlugin, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'

let globalPublicApi: RumPublicApi | undefined
let globalConfiguration: SvelteKitPluginConfiguration | undefined
let globalAddError: StartRumResult['addError'] | undefined

type InitSubscriber = (configuration: SvelteKitPluginConfiguration, rumPublicApi: RumPublicApi) => void
type StartSubscriber = (addError: StartRumResult['addError']) => void

const onRumInitSubscribers: InitSubscriber[] = []
const onRumStartSubscribers: StartSubscriber[] = []

export interface SvelteKitPluginConfiguration {
  router?: boolean
}

export type SvelteKitPlugin = Required<RumPlugin>

export function svelteKitPlugin(configuration: SvelteKitPluginConfiguration = {}): SvelteKitPlugin {
  return {
    name: 'sveltekit',
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

export function resetSvelteKitPlugin() {
  globalPublicApi = undefined
  globalConfiguration = undefined
  globalAddError = undefined
  onRumInitSubscribers.length = 0
  onRumStartSubscribers.length = 0
}
