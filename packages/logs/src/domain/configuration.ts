import type { Configuration, InitConfiguration } from '@datadog/browser-core'
import { ONE_KILO_BYTE, validateAndBuildConfiguration } from '@datadog/browser-core'
import { buildEnv } from '../boot/buildEnv'
import type { LogsEvent } from '../logsEvent.types'

export interface LogsInitConfiguration extends InitConfiguration {
  beforeSend?: ((event: LogsEvent) => void | boolean) | undefined
  forwardErrorsToLogs?: boolean | undefined
}

export type HybridInitConfiguration = Omit<LogsInitConfiguration, 'clientToken'>

export interface LogsConfiguration extends Configuration {
  forwardErrorsToLogs: boolean
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

  return {
    ...baseConfiguration,

    forwardErrorsToLogs: !!initConfiguration.forwardErrorsToLogs,

    requestErrorResponseLengthLimit: DEFAULT_REQUEST_ERROR_RESPONSE_LENGTH_LIMIT,
  }
}
