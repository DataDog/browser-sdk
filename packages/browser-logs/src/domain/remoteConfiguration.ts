import type { RemoteConfiguration } from '@datadog/browser-core'
import type { LogsInitConfiguration } from './configuration'

const SUPPORTED_LOGS_FIELDS: Array<keyof LogsInitConfiguration> = [
  'forwardErrorsToLogs',
  'forwardConsoleLogs',
  'forwardReports',
]

export function applyLogsRemoteConfiguration(
  initConfiguration: LogsInitConfiguration,
  remoteConfiguration: RemoteConfiguration
): LogsInitConfiguration {
  if (!remoteConfiguration.logs) {
    return initConfiguration
  }
  const logsRemoteConfiguration = remoteConfiguration.logs as Record<string, unknown>
  const appliedConfiguration = { ...initConfiguration } as LogsInitConfiguration & Record<string, unknown>
  SUPPORTED_LOGS_FIELDS.forEach((field: string) => {
    if (field in logsRemoteConfiguration) {
      appliedConfiguration[field] = logsRemoteConfiguration[field]
    }
  })
  return appliedConfiguration
}
