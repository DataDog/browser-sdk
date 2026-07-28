import type { InitConfiguration, RawTelemetryConfiguration } from '@datadog/browser-core'
import { ConsoleApiName } from '@datadog/js-core/util'
import {
  serializeConfiguration,
  catchUserErrors,
  display,
  RawReportType,
  BROWSER_CORE_SCHEMA,
} from '@datadog/browser-core'
import { validateAndBuildConfiguration } from '@datadog/js-core/configuration'
import type { InferredConfig } from '@datadog/js-core/configuration'
import type { LogsEvent } from '../logsEvent.types'
import type { LogsEventDomainContext } from '../domainContext.types'

/**
 * Init Configuration for the Logs browser SDK.
 *
 * @category Main
 * @example NPM
 * ```ts
 * import { datadogLogs } from '@datadog/browser-logs'
 *
 * datadogLogs.init({
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   site: '<DATADOG_SITE>',
 *   // ...
 * })
 * ```
 * @example CDN
 * ```ts
 * DD_LOGS.init({
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   site: '<DATADOG_SITE>',
 *   // ...
 * })
 * ```
 */
export interface LogsInitConfiguration extends InitConfiguration {
  /**
   * Access to every logs collected by the Logs SDK before they are sent to Datadog.
   * It allows:
   * - Enrich your logs with additional context attributes
   * - Modify your logs to modify their content, or redact sensitive sequences (see the list of editable properties)
   * - Discard selected logs
   *
   * @category Data Collection
   */
  beforeSend?: LogsBeforeSend | undefined

  /**
   * Forward uncaught exceptions and network errors to Datadog.
   *
   * To capture `console.error` calls, use {@link forwardConsoleLogs} with `"error"` (or `"all"`).
   *
   * @category Data Collection
   * @defaultValue true
   * @see forwardConsoleLogs
   */
  forwardErrorsToLogs?: boolean | undefined

  /**
   * Forward logs from console.* to Datadog. Use "all" to forward everything or an array of console API names to forward only a subset.
   *
   * @category Data Collection
   */
  forwardConsoleLogs?: ConsoleApiName[] | 'all' | undefined

  /**
   * Forward reports from the [Reporting API](https://developer.mozilla.org/en-US/docs/Web/API/Reporting_API) to Datadog. Use "all" to forward everything or an array of report types to forward only a subset.
   *
   * @category Data Collection
   */
  forwardReports?: RawReportType[] | 'all' | undefined
}

/**
 * Function called before a Log event is sent to Datadog. See {@link LogsInitConfiguration.beforeSend}
 *
 * @param event - The log event
 * @param context - The log event domain context
 * @returns true if the event should be sent to Datadog, false otherwise
 */
export type LogsBeforeSend = (event: LogsEvent, context: LogsEventDomainContext) => boolean

export const LOGS_SCHEMA = {
  ...BROWSER_CORE_SCHEMA,
  forwardErrorsToLogs: { type: 'boolean', default: true, strict: false },
  forwardConsoleLogs: {
    type: 'enum',
    values: ConsoleApiName,
    multiple: true,
    allowAll: true,
    default: [] as ConsoleApiName[],
  },
  forwardReports: {
    type: 'enum',
    values: RawReportType,
    multiple: true,
    allowAll: true,
    default: [] as RawReportType[],
  },
} as const

export type LogsConfiguration = InferredConfig<typeof LOGS_SCHEMA>

export function validateAndBuildLogsConfiguration(
  initConfiguration: LogsInitConfiguration
): LogsConfiguration | undefined {
  const config = validateAndBuildConfiguration(
    initConfiguration as unknown as Record<string, unknown>,
    LOGS_SCHEMA,
    display
  )
  if (!config) {
    return
  }
  return {
    ...config,
    beforeSend: config.beforeSend ? catchUserErrors(config.beforeSend as any, 'beforeSend threw an error:') : undefined,
  }
}

export function serializeLogsConfiguration(configuration: LogsInitConfiguration) {
  const baseSerializedInitConfiguration = serializeConfiguration(configuration)

  return {
    forward_errors_to_logs: configuration.forwardErrorsToLogs,
    forward_console_logs: configuration.forwardConsoleLogs,
    forward_reports: configuration.forwardReports,
    ...baseSerializedInitConfiguration,
  } satisfies RawTelemetryConfiguration
}
