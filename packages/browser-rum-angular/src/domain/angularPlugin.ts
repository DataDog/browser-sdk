import { VERSION } from '@angular/core'
import { toIntegrations, toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumInternalApi, RumPlugin, RumPublicApi } from '@datadog/browser-rum-core'

type InitSubscriber = (
  configuration: AngularPluginConfiguration,
  rumPublicApi: RumPublicApi,
  internalApi: RumInternalApi
) => void

let globalPublicApi: RumPublicApi | undefined
let globalConfiguration: AngularPluginConfiguration | undefined
let globalInternalApi: RumInternalApi | undefined

const onRumInitSubscribers: InitSubscriber[] = []

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
      const angularIntegration = toMajorVersionIntegration('angular', VERSION.major)
      return {
        router: !!configuration.router,
        integrations: toIntegrations(angularIntegration, configuration.router && 'angular-router'),
      }
    },
  } satisfies RumPlugin
}

export function onRumInit(callback: InitSubscriber) {
  if (globalConfiguration && globalPublicApi && globalInternalApi) {
    callback(globalConfiguration, globalPublicApi, globalInternalApi)
  } else {
    onRumInitSubscribers.push(callback)
  }
}

export function resetAngularPlugin() {
  globalPublicApi = undefined
  globalConfiguration = undefined
  globalInternalApi = undefined
  onRumInitSubscribers.length = 0
}
