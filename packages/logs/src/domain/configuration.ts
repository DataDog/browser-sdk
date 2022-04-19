import type { Configuration, InitConfiguration } from '@datadog/browser-core'
import {
  assign,
  ONE_KILO_BYTE,
  validateAndBuildConfiguration,
  display,
  removeDuplicates,
  ConsoleApiName,
  RawReportType,
  includes,
  objectValues,
} from '@datadog/browser-core'
import type { LogsEvent } from '../logsEvent.types'

export interface LogsInitConfiguration extends InitConfiguration {
  beforeSend?: ((event: LogsEvent) => void | boolean) | undefined
  forwardErrorsToLogs?: boolean | undefined
  forwardConsoleLogs?: readonly ConsoleApiName[] | 'all' | undefined
  forwardReports?: readonly RawReportType[] | 'all' | undefined
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
export const DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT = 32 * ONE_KILO_BYTE

export function validateAndBuildLogsConfiguration(
  initConfiguration: LogsInitConfiguration
): LogsConfiguration | undefined {
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
