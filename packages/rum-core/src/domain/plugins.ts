import { assign, display } from '@datadog/browser-core'
import type { TelemetryEvent, Context, RelativeTime } from '@datadog/browser-core'
import type { RumPublicApi } from '../boot/rumPublicApi'
import type { RumEvent } from '../rumEvent.types'
import type { RumInitConfiguration } from './configuration'

export const PLUGINS_NAMES = ['action'] as const

export interface RumPlugin {
  name: string
  getApi?(): { [key: string]: any }
  getConfigurationTelemetry?(): Record<string, unknown>
  getInternalContext?(options: { startTime: RelativeTime }): Context

  onInit?(options: { initConfiguration: RumInitConfiguration; publicApi: RumPublicApi }): void
  onStart?(...args: any[]): void
  onEvent?(options: { startTime: RelativeTime; rumEvent: RumEvent & Context }): void
  onTelemetryEvent?(options: { telemetryEvent: TelemetryEvent }): void
}

type MethodNames = 'onInit' | 'onStart' | 'onEvent' | 'onTelemetryEvent'

type MethodParameter<MethodName extends MethodNames> = Parameters<NonNullable<RumPlugin[MethodName]>>[0]

export function callPluginsMethod<MethodName extends MethodNames>(
  plugins: RumPlugin[] | undefined,
  methodName: MethodName,
  parameter: MethodParameter<MethodName>
) {
  if (!plugins) {
    return
  }
  for (const plugin of plugins) {
    const method = plugin[methodName]
    if (method) {
      method(parameter)
    }
  }
}

export function getPluginsInternalContext(plugins: RumPlugin[], startTime: RelativeTime): Context {
  const internalContexts = plugins.reduce(
    (context, plugin) => assign(context, plugin.getInternalContext?.({ startTime })),
    {}
  )
  return internalContexts
}

export function getPluginsApis(plugins: RumPlugin[]): Context {
  const apis = plugins.reduce((context, plugin) => assign(context, plugin.getApi?.()), {})
  return apis
}

const lazyPluginPaths = {
  // eslint-disable-next-line import/no-cycle
  action: () => import(/* webpackChunkName: "action" */ /* webpackMode: "lazy" */ './action/actionPlugin'),
}

type LazyPluginKeys = keyof typeof lazyPluginPaths

export async function loadLazyPlugins(pluginNames: LazyPluginKeys[]): Promise<RumPlugin[] | undefined> {
  const pluginPaths = pluginNames.map((name) => lazyPluginPaths[name])

  try {
    const plugins = await Promise.all(
      pluginPaths.map(async (path) => {
        const { default: createPlugin } = await path()
        return createPlugin()
      })
    )
    return plugins
  } catch (e) {
    displayLazyPluginFetchingError()
    return undefined
  }
}

function displayLazyPluginFetchingError() {
  display.error('Error fetching the Browser SDK plugins.')
}
