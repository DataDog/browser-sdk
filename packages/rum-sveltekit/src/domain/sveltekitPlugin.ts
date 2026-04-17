import type { RumPlugin, RumPublicApi } from '@datadog/browser-rum-core'

let globalPublicApi: RumPublicApi | undefined
let globalConfiguration: SveltekitPluginConfiguration | undefined

type InitSubscriber = (configuration: SveltekitPluginConfiguration, rumPublicApi: RumPublicApi) => void

const onRumInitSubscribers: InitSubscriber[] = []

export interface SveltekitPluginConfiguration {
  router?: boolean
}

export type SveltekitPlugin = Required<Omit<RumPlugin, 'onRumStart'>>

export function sveltekitPlugin(configuration: SveltekitPluginConfiguration = {}): SveltekitPlugin {
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

export function resetSveltekitPlugin() {
  globalPublicApi = undefined
  globalConfiguration = undefined
  onRumInitSubscribers.length = 0
}
