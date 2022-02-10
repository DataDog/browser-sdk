import type { Configuration, InitConfiguration } from '@datadog/browser-core'
import {
  ONE_KILO_BYTE,
  validateAndBuildConfiguration,
  display,
  isExperimentalFeatureEnabled,
  removeDuplicates,
  ConsoleApiName,
  includes,
} from '@datadog/browser-core'
import { buildEnv } from '../boot/buildEnv'
import type { LogsEvent } from '../logsEvent.types'
import type { StatusType } from './logger'

export interface LogsInitConfiguration extends InitConfiguration {
  beforeSend?: ((event: LogsEvent) => void | boolean) | undefined
  forwardErrorsToLogs?: boolean | undefined
  forwardConsoleLogs?: readonly ConsoleApiName[] | 'all' | undefined
}

export type HybridInitConfiguration = Omit<LogsInitConfiguration, 'clientToken'>

export interface LogsConfiguration extends Configuration {
  forwardErrorsToLogs: boolean
  forwardConsoleLogs: ConsoleApiName[]
  requestErrorResponseLengthLimit: number
}

/**
 * arbitrary value, byte precision not needed
 */
export const DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT = 32 * ONE_KILO_BYTE

export function validateAndBuildLogsConfiguration(
  initConfiguration: LogsInitConfiguration
): LogsConfiguration | undefined {
  const baseConfiguration = validateAndBuildConfiguration(initConfiguration, buildEnv)
  if (!baseConfiguration) {
    return
  }

  const allowedConsoleApis = Object.keys(ConsoleApiName) as ConsoleApiName[]
  let forwardConsoleLogs: StatusType[] = []
  if (isExperimentalFeatureEnabled('forward-logs') && initConfiguration.forwardConsoleLogs !== undefined) {
    if (
      (initConfiguration.forwardConsoleLogs !== 'all' && !Array.isArray(initConfiguration.forwardConsoleLogs)) ||
      (Array.isArray(initConfiguration.forwardConsoleLogs) &&
        initConfiguration.forwardConsoleLogs.some((api) => !includes(allowedConsoleApis, api)))
    ) {
      display.error(
        `Forward Console Logs should be "all" or an array with allowed values "${allowedConsoleApis.join('", "')}"`
      )
      return
    }

    forwardConsoleLogs =
      initConfiguration.forwardConsoleLogs === 'all' ? allowedConsoleApis : initConfiguration.forwardConsoleLogs
  }

  if (initConfiguration.forwardErrorsToLogs) {
    forwardConsoleLogs.push(ConsoleApiName.error)
  }

  return {
    ...baseConfiguration,

    forwardErrorsToLogs: !!initConfiguration.forwardErrorsToLogs,
    forwardConsoleLogs: removeDuplicates(forwardConsoleLogs),
    requestErrorResponseLengthLimit: DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT,
  }
}
