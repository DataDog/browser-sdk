import { version as reactVersion } from 'react'
import { toIntegrations, toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumInternalApi, RumPlugin, RumPublicApi } from '@datadog/browser-rum-core'

type ReactRouterType = 'react-router-v6' | 'react-router-v7' | 'react-router-v8' | 'tanstack-router-v1'
type InitSubscriber = (
  configuration: ReactPluginConfiguration,
  rumPublicApi: RumPublicApi,
  internalApi: RumInternalApi
) => void

let globalPublicApi: RumPublicApi | undefined
let globalConfiguration: ReactPluginConfiguration | undefined
let globalInternalApi: RumInternalApi | undefined
let routerType: ReactRouterType | undefined

const onRumInitSubscribers: InitSubscriber[] = []

/**
 * React plugin configuration.
 *
 * @category Main
 */
export interface ReactPluginConfiguration {
  /**
   * Enable router integration. Make sure to use functions from
   * {@link @datadog/browser-rum-react/react-router! | @datadog/browser-rum-react/react-router} or
   * {@link @datadog/browser-rum-react/tanstack-router! | @datadog/browser-rum-react/tanstack-router}
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
      const reactIntegration = toMajorVersionIntegration('react', reactVersion)
      return {
        router: !!configuration.router,
        integrations: toIntegrations(reactIntegration, configuration.router && routerType),
      }
    },
  } satisfies RumPlugin
}

export function setReactRouterType(type: ReactRouterType) {
  routerType = type
}

export function onRumInit(callback: InitSubscriber) {
  if (globalConfiguration && globalPublicApi && globalInternalApi) {
    callback(globalConfiguration, globalPublicApi, globalInternalApi)
  } else {
    onRumInitSubscribers.push(callback)
  }
}

export function resetReactPlugin() {
  globalPublicApi = undefined
  globalConfiguration = undefined
  globalInternalApi = undefined
  routerType = undefined
  onRumInitSubscribers.length = 0
}
