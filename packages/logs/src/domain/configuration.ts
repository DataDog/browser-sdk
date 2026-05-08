import type { Configuration, InitConfiguration, RawTelemetryConfiguration } from '@datadog/browser-core'
import {
  serializeConfiguration,
  ONE_KIBI_BYTE,
  validateAndBuildConfiguration,
  display,
  removeDuplicates,
  ConsoleApiName,
  RawReportType,
  objectValues,
} from '@datadog/browser-core'
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

export type HybridInitConfiguration = Omit<LogsInitConfiguration, 'clientToken'>

export interface LogsConfiguration extends Configuration {
  forwardErrorsToLogs: boolean
  forwardConsoleLogs: ConsoleApiName[]
  forwardReports: RawReportType[]
  requestErrorResponseLengthLimit: number
}

/**
 * arbitrary value, byte precision not needed
 */
export const DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT = 32 * ONE_KIBI_BYTE

export function validateAndBuildLogsConfiguration(
  initConfiguration: LogsInitConfiguration,
  errorStack?: string
): LogsConfiguration | undefined {
  const baseConfiguration = validateAndBuildConfiguration(initConfiguration, errorStack)

  const forwardConsoleLogs = validateAndBuildForwardOption<ConsoleApiName>(
    initConfiguration.forwardConsoleLogs,
    objectValues(ConsoleApiName),
    'Forward Console Logs'
  )

  const forwardReports = validateAndBuildForwardOption<RawReportType>(
    initConfiguration.forwardReports,
    objectValues(RawReportType),
    'Forward Reports'
  )

  if (!baseConfiguration || !forwardConsoleLogs || !forwardReports) {
    return
  }

  return {
    forwardErrorsToLogs: initConfiguration.forwardErrorsToLogs !== false,
    forwardConsoleLogs,
    forwardReports,
    requestErrorResponseLengthLimit: DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT,
    ...baseConfiguration,
  }
}

export function validateAndBuildForwardOption<T>(
  option: readonly T[] | 'all' | undefined,
  allowedValues: T[],
  label: string
): T[] | undefined {
  if (option === undefined) {
    return []
  }

  if (!(option === 'all' || (Array.isArray(option) && option.every((api) => allowedValues.includes(api))))) {
    display.error(`${label} should be "all" or an array with allowed values "${allowedValues.join('", "')}"`)
    return
  }

  return option === 'all' ? allowedValues : removeDuplicates<T>(option)
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
