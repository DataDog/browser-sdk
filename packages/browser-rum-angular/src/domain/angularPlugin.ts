import { VERSION } from '@angular/core'
import { callMonitored } from '@datadog/js-core/monitor'
import { display, toIntegrations, toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumPlugin, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'

type ViewOptions = Parameters<RumPublicApi['startView']>[0]
type ErrorPayload = Parameters<NonNullable<StartRumResult['addError']>>[0]

// RUM might start after views and errors are reported, or never (e.g. during server-side
// rendering). Until then, keep plain data only: a callback created in a framework scope (router
// subscription...) would keep that whole scope alive, and minifiers can inline functions into such
// scopes. Keep only the latest view, and a bounded number of errors like the core SDK does.
const MAX_PENDING_ERRORS = 500
let pendingView: ViewOptions | undefined
let pendingErrors: ErrorPayload[] = []
let startView: ((view: ViewOptions) => void) | undefined
let addError: ((error: ErrorPayload) => void) | undefined

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
      startView = (view) => {
        if (!configuration.router) {
          display.warn('`router: true` is missing from the angular plugin configuration, the view will not be tracked.')
          return
        }
        publicApi.startView(view)
      }
      if (pendingView) {
        startView(pendingView)
        pendingView = undefined
      }
      if (configuration.router) {
        initConfiguration.trackViewsManually = true
      }
    },
    onRumStart({ addError: rumAddError }) {
      if (!rumAddError) {
        return
      }
      addError = (error) => callMonitored(() => rumAddError(error))
      pendingErrors.forEach(addError)
      pendingErrors = []
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

export function startAngularViewWhenReady(view: ViewOptions) {
  if (startView) {
    startView(view)
  } else {
    pendingView = view
  }
}

export function addAngularErrorWhenReady(error: ErrorPayload) {
  if (addError) {
    addError(error)
    return
  }
  pendingErrors.push(error)
  if (pendingErrors.length > MAX_PENDING_ERRORS) {
    pendingErrors.shift()
  }
}

export function resetAngularPlugin() {
  pendingView = undefined
  pendingErrors = []
  startView = undefined
  addError = undefined
}
