import { VERSION } from '@angular/core'
import { callMonitored } from '@datadog/js-core/monitor'
import { BufferedObservable } from '@datadog/js-core/util'
import { display, toIntegrations, toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumPlugin, StartRumResult, ViewOptions } from '@datadog/browser-rum-core'

type ErrorPayload = Parameters<NonNullable<StartRumResult['addError']>>[0]

// RUM may start late, or never (e.g. during server-side rendering). Until then, buffer plain data
// rather than callbacks, which would retain the scope they were created in (router, app...), and
// cap the buffers like the core SDK pre-start buffer.
const BUFFER_LIMIT = 500

let views: BufferedObservable<ViewOptions> | undefined
let errors: BufferedObservable<ErrorPayload> | undefined

function getViews() {
  return (views ??= new BufferedObservable(BUFFER_LIMIT))
}

function getErrors() {
  return (errors ??= new BufferedObservable(BUFFER_LIMIT))
}

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
      getViews().subscribe((view) => {
        if (!configuration.router) {
          display.warn('`router: true` is missing from the angular plugin configuration, the view will not be tracked.')
          return
        }
        publicApi.startView(view)
      })
      getViews().unbuffer()
      if (configuration.router) {
        initConfiguration.trackViewsManually = true
      }
    },
    onRumStart({ addError }) {
      if (addError) {
        getErrors().subscribe((error) => callMonitored(() => addError(error)))
        getErrors().unbuffer()
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

export function startAngularViewWhenReady(view: ViewOptions) {
  getViews().notify(view)
}

export function addAngularErrorWhenReady(error: ErrorPayload) {
  getErrors().notify(error)
}

export function resetAngularPlugin() {
  views = undefined
  errors = undefined
}
