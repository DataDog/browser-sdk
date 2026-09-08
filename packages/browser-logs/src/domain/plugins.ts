import type { LogsPublicApi } from '../boot/logsPublicApi'
import type { StartLogsResult } from '../boot/startLogs'
import type { LogsInitConfiguration } from './configuration'
import type { AssembleHook } from './hooks'

/**
 * onInit plugin API options.
 *
 * @experimental
 */
export interface OnInitOptions {
  initConfiguration: LogsInitConfiguration
  publicApi: LogsPublicApi
  /**
   * Register a callback invoked when a log event is assembled, so plugins can enrich or override
   * log fields before they are sent. Callbacks registered in `onInit` run before any log is
   * assembled, including logs buffered during the pre-start phase.
   */
  registerAssembleEventHook: AssembleHook['register']
}

/**
 * onLogsStart plugin API options.
 *
 * @experimental
 */
export interface OnLogsStartOptions {
  /**
   * Emit a log with the same pipeline as a logger call.
   */
  handleLog: StartLogsResult['handleLog']
}

/**
 * Plugin interface of the Logs browser SDK.
 *
 * The plugins API is unstable and experimental, and may change without
 * notice. Please use only plugins provided by Datadog matching the version of the SDK you are
 * using.
 *
 * @experimental
 */
export interface LogsPlugin {
  name: string
  getConfigurationTelemetry?(): Record<string, unknown>
  onInit?(options: OnInitOptions): void
  onLogsStart?(options: OnLogsStartOptions): void
}

type MethodNames = 'onInit' | 'onLogsStart'
type MethodParameter<MethodName extends MethodNames> = Parameters<NonNullable<LogsPlugin[MethodName]>>[0]

export function callPluginsMethod<MethodName extends MethodNames>(
  plugins: LogsPlugin[] | undefined,
  methodName: MethodName,
  parameter: MethodParameter<MethodName>
): void
export function callPluginsMethod<MethodName extends MethodNames>(
  plugins: LogsPlugin[] | undefined,
  methodName: MethodName,
  parameter: any
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
