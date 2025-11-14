import { generateUUID } from '@datadog/browser-core'
import type { RumPlugin, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'
import type { RawRumResourceEvent } from '@datadog/browser-rum-core/src/rawRumEvent.types'
import type { SpanInfo } from '../trace'

let globalPublicApi: RumPublicApi | undefined
let globalConfiguration: ElectronPluginConfiguration | undefined
let globalAddEvent: StartRumResult['addEvent'] | undefined
type InitSubscriber = (configuration: ElectronPluginConfiguration, rumPublicApi: RumPublicApi) => void
type StartSubscriber = (addEvent: StartRumResult['addEvent']) => void

const onRumInitSubscribers: InitSubscriber[] = []
const onRumStartSubscribers: StartSubscriber[] = []

/**
 * Electron plugin configuration.
 *
 * @category Main
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ElectronPluginConfiguration {}

/**
 * Electron plugin type.
 *
 * The plugins API is unstable and experimental, and may change without notice. Please don't use this type directly.
 *
 * @internal
 */
export type ElectronPlugin = Required<RumPlugin>

// eslint-disable-next-line no-restricted-syntax
declare global {
  interface Window {
    dd_electron_internal_api: {
      onSpan: (callback: (spanInfo: SpanInfo) => void) => void
    }
  }
}

/**
 * Electron plugin constructor.
 *
 * @category Main
 * @example
 * ```ts
 * import { datadogRum } from '@datadog/browser-rum'
 * import { electronPlugin } from '@datadog/electron/renderer'
 *
 * datadogRum.init({
 *   applicationId: '<DATADOG_APPLICATION_ID>',
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   site: '<DATADOG_SITE>',
 *   plugins: [electronPlugin()],
 *   // ...
 * })
 * ```
 */
export function electronPlugin(configuration: ElectronPluginConfiguration = {}): ElectronPlugin {
  return {
    name: 'electron',
    onInit({ publicApi }) {
      globalPublicApi = publicApi
      globalConfiguration = configuration
      for (const subscriber of onRumInitSubscribers) {
        subscriber(globalConfiguration, globalPublicApi)
      }
    },
    onRumStart({ addEvent }) {
      globalAddEvent = addEvent

      if (!addEvent) {
        return
      }

      for (const subscriber of onRumStartSubscribers) {
        subscriber(addEvent)
      }

      window.dd_electron_internal_api.onSpan((spanInfo: SpanInfo) => {
        const event: RawRumResourceEvent = {
          date: spanInfo.startClocks.timeStamp,
          type: 'resource',
          _dd: {
            span_id: spanInfo.spanId,
            trace_id: spanInfo.traceId,
            discarded: false,
            rule_psr: 1,
          },
          resource: {
            type: 'native',
            id: generateUUID(),
            url: spanInfo.name,
            method: 'GET',
            duration: spanInfo.duration,
          },
        }

        // @ts-expect-error - TODO: fix this - probably also due to deep imports - it break at build time
        addEvent(spanInfo.startClocks.relative, event, {}, spanInfo.duration)
      })
    },
    getConfigurationTelemetry() {
      return {}
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

export function resetElectronPlugin() {
  globalPublicApi = undefined
  globalConfiguration = undefined
  globalAddEvent = undefined
  onRumInitSubscribers.length = 0
  onRumStartSubscribers.length = 0
}
