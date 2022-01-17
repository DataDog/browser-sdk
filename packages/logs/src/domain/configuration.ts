import type { Configuration, InitConfiguration } from '@datadog/browser-core'
import { validateAndBuildConfiguration } from '@datadog/browser-core'
import { buildEnv } from '../boot/buildEnv'
import type { LogsEvent } from '../logsEvent.types'

export interface LogsInitConfiguration extends InitConfiguration {
  beforeSend?: ((event: LogsEvent) => void | boolean) | undefined
  forwardErrorsToLogs?: boolean | undefined
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
