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
 * @category Configuration
 * @example
 * ```ts
 * DD_LOGS.init({
 *   applicationId: '<DATADOG_APPLICATION_ID>',
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   site: '<DATADOG_SITE>',
 *   ...
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
   */
  beforeSend?: ((event: LogsEvent, context: LogsEventDomainContext) => boolean) | undefined
  /**
   * Forward console.error logs, uncaught exceptions and network errors to Datadog.
   *
   * @defaultValue true
   */
  forwardErrorsToLogs?: boolean | undefined
  /**
   * Forward logs from console.* to Datadog. Use "all" to forward everything or an array of console API names to forward only a subset.
   */
  forwardConsoleLogs?: ConsoleApiName[] | 'all' | undefined
  /**
   * Forward reports from the [Reporting API](https://developer.mozilla.org/en-US/docs/Web/API/Reporting_API) to Datadog. Use "all" to forward everything or an array of report types to forward only a subset.
   */
  forwardReports?: RawReportType[] | 'all' | undefined
  /**
   * Use PCI-compliant intake. See [PCI DSS Compliance](https://docs.datadoghq.com/data_security/pci_compliance/?tab=logmanagement) for further information.
   *
   * @defaultValue false
   */
  usePciIntake?: boolean
}

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
  initConfiguration: LogsInitConfiguration
): LogsConfiguration | undefined {
  if (initConfiguration.usePciIntake === true && initConfiguration.site && initConfiguration.site !== 'datadoghq.com') {
    display.warn(
      'PCI compliance for Logs is only available for Datadog organizations in the US1 site. Default intake will be used.'
    )
  }

  const baseConfiguration = validateAndBuildConfiguration(initConfiguration)

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

  if (initConfiguration.forwardErrorsToLogs && !forwardConsoleLogs.includes(ConsoleApiName.error)) {
    forwardConsoleLogs.push(ConsoleApiName.error)
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
    use_pci_intake: configuration.usePciIntake,
    ...baseSerializedInitConfiguration,
  } satisfies RawTelemetryConfiguration
}
