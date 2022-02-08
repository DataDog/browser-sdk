import type { Configuration, InitConfiguration } from '@datadog/browser-core'
import {
  ONE_KILO_BYTE,
  validateAndBuildConfiguration,
  display,
  isExperimentalFeatureEnabled,
  removeDuplicates,
  ConsoleApiName,
  CONSOLE_APIS,
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

  let forwardConsoleLogs: StatusType[] = []
  if (isExperimentalFeatureEnabled('forward-logs')) {
    if (
      initConfiguration.forwardConsoleLogs !== undefined &&
      initConfiguration.forwardConsoleLogs !== 'all' &&
      !Array.isArray(initConfiguration.forwardConsoleLogs)
    ) {
      display.error('Forward Console Logs should be an array')
      return
    }

    forwardConsoleLogs =
      initConfiguration.forwardConsoleLogs === 'all' ? CONSOLE_APIS : initConfiguration.forwardConsoleLogs || []
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
