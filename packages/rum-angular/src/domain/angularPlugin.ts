import type { RumPlugin, RumPublicApi } from '@datadog/browser-rum-core'

type InitSubscriber = (rumPublicApi: RumPublicApi) => void

let globalPublicApi: RumPublicApi | undefined

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
    onInit({ publicApi, initConfiguration }) {
      globalPublicApi = publicApi

      if (configuration.router) {
        initConfiguration.trackViewsManually = true
      }

      for (const subscriber of onRumInitSubscribers) {
        subscriber(publicApi)
      }
      onRumInitSubscribers.length = 0
    },
    getConfigurationTelemetry() {
      return { router: !!configuration.router }
    },
  } satisfies RumPlugin
}

export function startAngularView(viewName: string) {
  if (globalPublicApi) {
    globalPublicApi.startView({ name: viewName })
  }
}

export function onRumInit(callback: InitSubscriber) {
  if (globalPublicApi) {
    callback(globalPublicApi)
  } else {
    onRumInitSubscribers.push(callback)
  }
}

export function resetAngularPlugin() {
  globalPublicApi = undefined
  onRumInitSubscribers.length = 0
}
