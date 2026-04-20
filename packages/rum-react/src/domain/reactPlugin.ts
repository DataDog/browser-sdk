import type { RumPlugin, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'
import { isSampled } from '@datadog/browser-rum-core'
import type { ReactProfilingController } from './createReactProfiler'
import { createReactProfiler } from './createReactProfiler'

let globalPublicApi: RumPublicApi | undefined
let globalConfiguration: ReactPluginConfiguration | undefined
let globalAddError: StartRumResult['addError'] | undefined
let globalReactProfiler: ReactProfilingController | undefined

type InitSubscriber = (configuration: ReactPluginConfiguration, rumPublicApi: RumPublicApi) => void
type StartSubscriber = (addError: StartRumResult['addError']) => void

const onRumInitSubscribers: InitSubscriber[] = []
const onRumStartSubscribers: StartSubscriber[] = []

/**
 * React plugin configuration.
 *
 * @category Main
 */
export interface ReactPluginConfiguration {
  /**
   * Enable router integration. Make sure to use functions from
   * {@link @datadog/browser-rum-react/react-router-v6! | @datadog/browser-rum-react/react-router-v6},
   * {@link @datadog/browser-rum-react/react-router-v7! | @datadog/browser-rum-react/react-router-v7}, or
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
    onRumStart({ addError, configuration: rumConfiguration, lifeCycle, session, viewHistory, createEncoder }) {
      globalAddError = addError

      if (rumConfiguration && lifeCycle && session && viewHistory && createEncoder) {
        const sessionData = session.findTrackedSession()
        if (sessionData && isSampled(sessionData.id, rumConfiguration.profilingSampleRate)) {
          const profiler = createReactProfiler(rumConfiguration, lifeCycle, session, createEncoder, viewHistory)
          globalReactProfiler = profiler
          profiler.start()
        }
      }

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

export function isReactProfilingRunning() {
  return globalReactProfiler?.isRunning() ?? false
}

export function getRunningReactProfiler(): ReactProfilingController | undefined {
  return globalReactProfiler?.isRunning() ? globalReactProfiler : undefined
}

export function resetReactPlugin() {
  globalPublicApi = undefined
  globalConfiguration = undefined
  globalAddError = undefined
  globalReactProfiler?.stop()
  globalReactProfiler = undefined
  onRumInitSubscribers.length = 0
  onRumStartSubscribers.length = 0
}
