import type { Configuration, InitConfiguration, RawTelemetryConfiguration } from '@datadog/browser-core'
import {
  serializeConfiguration,
  assign,
  ONE_KIBI_BYTE,
  validateAndBuildConfiguration,
  display,
  removeDuplicates,
  ConsoleApiName,
  RawReportType,
  includes,
  objectValues,
} from '@datadog/browser-core'
import type { LogsEvent } from '../logsEvent.types'
import type { LogsEventDomainContext } from '../domainContext.types'

export interface LogsInitConfiguration extends InitConfiguration {
  beforeSend?: ((event: LogsEvent, context: LogsEventDomainContext) => boolean) | undefined
  forwardErrorsToLogs?: boolean | undefined
  forwardConsoleLogs?: ConsoleApiName[] | 'all' | undefined
  forwardReports?: RawReportType[] | 'all' | undefined
  // TODO next major: remove this option and make it the default behaviour
  sendLogsAfterSessionExpiration?: boolean | undefined
  usePciIntake?: boolean
}

export type HybridInitConfiguration = Omit<LogsInitConfiguration, 'clientToken'>

export interface LogsConfiguration extends Configuration {
  forwardErrorsToLogs: boolean
  forwardConsoleLogs: ConsoleApiName[]
  forwardReports: RawReportType[]
  requestErrorResponseLengthLimit: number
  sendLogsAfterSessionExpiration: boolean
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

  if (initConfiguration.forwardErrorsToLogs && !includes(forwardConsoleLogs, ConsoleApiName.error)) {
    forwardConsoleLogs.push(ConsoleApiName.error)
  }

  return assign(
    {
      forwardErrorsToLogs: initConfiguration.forwardErrorsToLogs !== false,
      forwardConsoleLogs,
      forwardReports,
      requestErrorResponseLengthLimit: DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT,
      sendLogsAfterSessionExpiration: !!initConfiguration.sendLogsAfterSessionExpiration,
    },
    baseConfiguration
  )
}

export function validateAndBuildForwardOption<T>(
  option: readonly T[] | 'all' | undefined,
  allowedValues: T[],
  label: string
): T[] | undefined {
  if (option === undefined) {
    return []
  }

  if (!(option === 'all' || (Array.isArray(option) && option.every((api) => includes(allowedValues, api))))) {
    display.error(`${label} should be "all" or an array with allowed values "${allowedValues.join('", "')}"`)
    return
  }

  return option === 'all' ? allowedValues : removeDuplicates<T>(option)
}

export function serializeLogsConfiguration(configuration: LogsInitConfiguration) {
  const baseSerializedInitConfiguration = serializeConfiguration(configuration)

  return assign(
    {
      forward_errors_to_logs: configuration.forwardErrorsToLogs,
      forward_console_logs: configuration.forwardConsoleLogs,
      forward_reports: configuration.forwardReports,
      use_pci_intake: configuration.usePciIntake,
      send_logs_after_session_expiration: configuration.sendLogsAfterSessionExpiration,
    },
    baseSerializedInitConfiguration
  ) satisfies RawTelemetryConfiguration
}
