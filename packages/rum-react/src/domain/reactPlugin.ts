import type { RumPlugin, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'

let globalPublicApi: RumPublicApi | undefined
let globalConfiguration: ReactPluginConfiguration | undefined
let globalAddEvent: StartRumResult['addEvent'] | undefined
type InitSubscriber = (configuration: ReactPluginConfiguration, rumPublicApi: RumPublicApi) => void
type StartSubscriber = (addEvent: StartRumResult['addEvent']) => void

const onRumInitSubscribers: InitSubscriber[] = []
const onRumStartSubscribers: StartSubscriber[] = []

/**
 * React plugin configuration.
 *
 * @category Main
 */
export interface ReactPluginConfiguration {
  /**
   * Enable react-router integration. Make sure to use functions from
   * {@link @datadog/browser-rum-react/react-router-v6! | @datadog/browser-rum-react/react-router-v6} or
   * {@link @datadog/browser-rum-react/react-router-v7! | @datadog/browser-rum-react/react-router-v7}
   * to create the router.
   * ```
   */
  router?: boolean
}

/**
 * React plugin type.
 *
 * The plugins API is unstable and experimental, and may change without notice. Please don't use this type directly.
 *
 * @internal
 */
export type ReactPlugin = Required<RumPlugin>

/**
 * React plugin constructor.
 *
 * @category Main
 * @example
 * ```ts
 * import { datadogRum } from '@datadog/browser-rum'
 * import { reactPlugin } from '@datadog/browser-rum-react'
 *
 * datadogRum.init({
 *   applicationId: '<DATADOG_APPLICATION_ID>',
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   site: '<DATADOG_SITE>',
 *   plugins: [reactPlugin()],
 *   // ...
 * })
 * ```
 */
export function reactPlugin(configuration: ReactPluginConfiguration = {}): ReactPlugin {
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
        if (addEvent) {
          subscriber(addEvent)
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
