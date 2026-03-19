import type { RumPlugin, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'

type InitSubscriber = (configuration: AngularPluginConfiguration, rumPublicApi: RumPublicApi) => void
type StartSubscriber = (addError: StartRumResult['addError']) => void

let globalPublicApi: RumPublicApi | undefined
let globalConfiguration: AngularPluginConfiguration | undefined
let globalAddError: StartRumResult['addError'] | undefined

const onRumInitSubscribers: InitSubscriber[] = []
const onRumStartSubscribers: StartSubscriber[] = []

/**
 * Angular plugin configuration.
 *
 * @category Main
 */
export interface AngularPluginConfiguration {
  /**
   * Enable Angular Router integration. Make sure to use `provideDatadogRouter()` in your
   * application providers.
   */
  router?: boolean
}

/**
 * Angular plugin constructor.
 *
 * @category Main
 * @example
 * ```ts
 * import { datadogRum } from '@datadog/browser-rum'
 * import { angularPlugin } from '@datadog/browser-rum-angular'
 *
 * datadogRum.init({
 *   applicationId: '<DATADOG_APPLICATION_ID>',
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   site: '<DATADOG_SITE>',
 *   plugins: [angularPlugin({ router: true })],
 *   // ...
 * })
 * ```
 */
export function angularPlugin(configuration: AngularPluginConfiguration = {}): RumPlugin {
  return {
    name: 'angular',
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
      for (const subscriber of onRumStartSubscribers) {
        if (addError) {
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

export function resetAngularPlugin() {
  globalPublicApi = undefined
  globalConfiguration = undefined
  globalAddError = undefined
  onRumInitSubscribers.length = 0
  onRumStartSubscribers.length = 0
}
