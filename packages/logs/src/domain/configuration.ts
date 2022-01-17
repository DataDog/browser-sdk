import { Configuration, InitConfiguration, ONE_KILO_BYTE, validateAndBuildConfiguration } from '@datadog/browser-core'
import { buildEnv } from '../boot/buildEnv'
import { LogsEvent } from '../logsEvent.types'

export interface LogsInitConfiguration extends InitConfiguration {
  beforeSend?: ((event: LogsEvent) => void | boolean) | undefined
  forwardErrorsToLogs?: boolean | undefined
}

export type HybridInitConfiguration = Omit<LogsInitConfiguration, 'clientToken'>

export interface LogsConfiguration extends Configuration {
  forwardErrorsToLogs: boolean
  requestErrorResponseLengthLimit: number
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

    /**
     * arbitrary value, byte precision not needed
     */
    requestErrorResponseLengthLimit: 32 * ONE_KILO_BYTE,
  }
}
