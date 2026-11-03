import { VERSION } from '@angular/core'
import { callMonitored } from '@datadog/js-core/monitor'
import type { ClocksState } from '@datadog/js-core/time'
import { clocksNow } from '@datadog/js-core/time'
import { BufferedObservable } from '@datadog/js-core/util'
import { display, toIntegrations, toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumPlugin, StartRumResult } from '@datadog/browser-rum-core'

type ViewOptions = NonNullable<Parameters<StartRumResult['startView']>[0]>
type ErrorPayload = Parameters<NonNullable<StartRumResult['addError']>>[0]

interface PendingView {
  options: ViewOptions
  startClocks: ClocksState
}

// Views and errors are buffered until RUM is ready, like the core SDK buffers API calls made before
// `init()`. RUM might never be ready (e.g. during server-side rendering), so:
// - the buffers are bounded (same limit as the core SDK)
// - they hold plain data, not callbacks: a callback created in a framework scope (router
//   subscription...) would keep that whole scope alive, and minifiers can inline functions into
//   such scopes
const BUFFER_LIMIT = 500
let viewBuffer: BufferedObservable<PendingView> | undefined
let errorBuffer: BufferedObservable<ErrorPayload> | undefined

// Created lazily: modules must not have side effects
function getViewBuffer() {
  return (viewBuffer ??= new BufferedObservable<PendingView>(BUFFER_LIMIT))
}

function getErrorBuffer() {
  return (errorBuffer ??= new BufferedObservable<ErrorPayload>(BUFFER_LIMIT))
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
    onInit({ initConfiguration, startView }) {
      // Views keep the time they happened, including the ones buffered before init()
      getViewBuffer().subscribe(({ options, startClocks }) => {
        if (!configuration.router) {
          display.warn('`router: true` is missing from the angular plugin configuration, the view will not be tracked.')
          return
        }
        startView(options, startClocks)
      })
      getViewBuffer().unbuffer()
      if (configuration.router) {
        initConfiguration.trackViewsManually = true
      }
    },
    onRumStart({ addError }) {
      if (!addError) {
        return
      }
      getErrorBuffer().subscribe((error) => callMonitored(() => addError(error)))
      getErrorBuffer().unbuffer()
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

export function startAngularViewWhenReady(options: ViewOptions) {
  getViewBuffer().notify({ options, startClocks: clocksNow() })
}

export function addAngularErrorWhenReady(error: ErrorPayload) {
  getErrorBuffer().notify(error)
}

export function resetAngularPlugin() {
  viewBuffer = undefined
  errorBuffer = undefined
}
