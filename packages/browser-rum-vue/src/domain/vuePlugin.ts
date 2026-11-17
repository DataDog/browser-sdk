import { version as vueVersion } from 'vue'
import { callMonitored } from '@datadog/js-core/monitor'
import { BufferedObservable } from '@datadog/js-core/util'
import type { Subscription } from '@datadog/js-core/util'
import { display, toIntegrations, toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumPlugin, StartRumResult } from '@datadog/browser-rum-core'

export type VueErrorPayload = Parameters<NonNullable<StartRumResult['addError']>>[0]

// RUM may start late, or never (e.g. during server-side rendering). Until then, buffer plain data
// rather than callbacks, which would retain the scope they were created in (router, component
// instances...), and cap the buffers like the core SDK pre-start buffer.
const BUFFER_LIMIT = 500

let viewNames: BufferedObservable<string> | undefined
let errors: BufferedObservable<VueErrorPayload> | undefined
// onInit may run several times (e.g. init retried after an invalid configuration): keep a single view subscriber
let viewSubscription: Subscription | undefined

function getViewNames() {
  return (viewNames ??= new BufferedObservable(BUFFER_LIMIT))
}

function getErrors() {
  return (errors ??= new BufferedObservable(BUFFER_LIMIT))
}

export interface VuePluginConfiguration {
  router?: boolean
}

export type VuePlugin = Required<RumPlugin>

export function vuePlugin(configuration: VuePluginConfiguration = {}): VuePlugin {
  return {
    name: 'vue',
    onInit({ publicApi, initConfiguration }) {
      viewSubscription?.unsubscribe()
      viewSubscription = getViewNames().subscribe((viewName) => {
        if (!configuration.router) {
          display.warn('`router: true` is missing from the vue plugin configuration, the view will not be tracked.')
          return
        }
        publicApi.startView(viewName)
      })
      getViewNames().unbuffer()
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
      const vueIntegration = toMajorVersionIntegration('vue', vueVersion)
      return {
        router: !!configuration.router,
        integrations: toIntegrations(vueIntegration, configuration.router && 'vue-router'),
      }
    },
  } satisfies RumPlugin
}

export function startVueViewWhenReady(viewName: string) {
  getViewNames().notify(viewName)
}

export function addVueErrorWhenReady(error: VueErrorPayload) {
  getErrors().notify(error)
}

export function resetVuePlugin() {
  viewSubscription?.unsubscribe()
  viewSubscription = undefined
  viewNames = undefined
  errors = undefined
}
