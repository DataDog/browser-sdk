import type { RumPlugin, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'

let globalPublicApi: RumPublicApi | undefined
let globalConfiguration: SolidPluginConfiguration | undefined
let globalAddError: StartRumResult['addError'] | undefined
type InitSubscriber = (configuration: SolidPluginConfiguration, rumPublicApi: RumPublicApi) => void
type StartSubscriber = (addError: StartRumResult['addError']) => void

const onRumInitSubscribers: InitSubscriber[] = []
const onRumStartSubscribers: StartSubscriber[] = []

/**
 * Solid plugin configuration.
 *
 * @category Main
 */
export interface SolidPluginConfiguration {
  /**
   * Enable @solidjs/router integration. Place <RumSolidRouter /> inside your <Router> tree
   * to enable automatic view tracking.
   */
  router?: boolean
}

/**
 * Solid plugin type.
 *
 * The plugins API is unstable and experimental, and may change without notice.
 *
 * @internal
 */
export type SolidPlugin = Required<RumPlugin>

/**
 * Solid plugin constructor.
 *
 * @category Main
 * @example
 * ```ts
 * import { datadogRum } from '@datadog/browser-rum'
 * import { solidPlugin } from '@datadog/browser-rum-solid'
 *
 * datadogRum.init({
 *   applicationId: '<DATADOG_APPLICATION_ID>',
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   site: '<DATADOG_SITE>',
 *   plugins: [solidPlugin({ router: true })],
 *   // ...
 * })
 * ```
 */
export function solidPlugin(configuration: SolidPluginConfiguration = {}): SolidPlugin {
  return {
    name: 'solid',
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

export function resetSolidPlugin() {
  globalPublicApi = undefined
  globalConfiguration = undefined
  globalAddError = undefined
  onRumInitSubscribers.length = 0
  onRumStartSubscribers.length = 0
}
