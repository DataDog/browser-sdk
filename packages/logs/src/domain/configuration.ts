import { Configuration, InitConfiguration, validateAndBuildConfiguration } from '@datadog/browser-core'
import { buildEnv } from '../boot/buildEnv'
import { LogsEvent } from '../logsEvent.types'

export interface LogsInitConfiguration extends InitConfiguration {
  beforeSend?: ((event: LogsEvent) => void | boolean) | undefined
  forwardErrorsToLogs?: boolean | undefined
}

export type HybridInitConfiguration = Omit<LogsInitConfiguration, 'clientToken'>

export interface LogsConfiguration extends Configuration {
  forwardErrorsToLogs: boolean

  // Event limits
  maxWarningsPerMinute: number
  maxInfosPerMinute: number
  maxDebugsPerMinute: number
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
    maxWarningsPerMinute: 3000,
    maxInfosPerMinute: 3000,
    maxDebugsPerMinute: 3000,
  }
}
