import { Configuration, InitConfiguration, validateAndBuildConfiguration } from '@datadog/browser-core'
import { buildEnv } from '../boot/buildEnv'
import { LogsEvent } from '../logsEvent.types'

export interface LogsInitConfiguration extends InitConfiguration {
  forwardErrorsToLogs?: boolean | undefined
  beforeSend?: ((event: LogsEvent) => void | boolean) | undefined
}

export type HybridInitConfiguration = Omit<LogsInitConfiguration, 'clientToken'>

const DEFAULT_LOGS_CONFIGURATION = {
  forwardErrorsToLogs: false,
}

export type LogsConfiguration = Configuration & typeof DEFAULT_LOGS_CONFIGURATION

export function validateAndBuildLogsConfiguration(
  initConfiguration: LogsInitConfiguration
): LogsConfiguration | undefined {
  const baseConfiguration = validateAndBuildConfiguration(initConfiguration, buildEnv)
  if (!baseConfiguration) {
    return
  }

  const configuration: LogsConfiguration = {
    ...baseConfiguration,
    ...DEFAULT_LOGS_CONFIGURATION,
  }

  if (initConfiguration.forwardErrorsToLogs !== undefined) {
    configuration.forwardErrorsToLogs = !!initConfiguration.forwardErrorsToLogs
  }

  return configuration
}
