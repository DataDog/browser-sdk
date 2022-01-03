import { Configuration, InitConfiguration, validateAndBuildConfiguration } from '@datadog/browser-core'
import { buildEnv } from '../boot/buildEnv'
import { LogsEvent } from '../logsEvent.types'

export interface LogsInitConfiguration extends InitConfiguration {
  forwardErrorsToLogs?: boolean | undefined
  beforeSend?: ((event: LogsEvent) => void | boolean) | undefined
}

export type HybridInitConfiguration = Omit<LogsInitConfiguration, 'clientToken'>

export interface LogsConfiguration extends Configuration {
  forwardErrorsToLogs: boolean
}

export function validateAndBuildLogsConfiguration(
  initConfiguration: LogsInitConfiguration
): LogsConfiguration | undefined {
  const baseConfiguration = validateAndBuildConfiguration(initConfiguration, buildEnv)
  if (!baseConfiguration) {
    return
  }

  return {
    ...baseConfiguration,

    forwardErrorsToLogs: !!initConfiguration.forwardErrorsToLogs,
  }
}
