import {
  type RemoteConfiguration,
  createConfigurationCache,
  fetchRemoteConfiguration,
  getRemoteConfigurationId,
  monitorError,
} from '@datadog/browser-core'
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

export function getLogsRemoteConfiguration(
  initConfiguration: LogsInitConfiguration
): LogsInitConfiguration | undefined {
  const cache = createConfigurationCache<RemoteConfiguration>({
    remoteConfigurationId: getRemoteConfigurationId(initConfiguration)!,
  })

  const cacheResult = cache.read()

  // Background sync — update the cache for the next page load
  fetchRemoteConfiguration(initConfiguration)
    .then((fetchResult) => {
      if (fetchResult.ok) {
        cache.write(fetchResult.value)
      }
    })
    .catch(monitorError)

  if (cacheResult.status === 'hit') {
    return applyLogsRemoteConfiguration(initConfiguration, cacheResult.config)
  }

  if (initConfiguration.remoteConfiguration?.required) {
    return undefined
  }

  return initConfiguration
}

export async function fetchAndApplyLogsRemoteConfiguration(
  initConfiguration: LogsInitConfiguration
): Promise<LogsInitConfiguration | undefined> {
  const fetchResult = await fetchRemoteConfiguration(initConfiguration)
  if (!fetchResult.ok) {
    return undefined
  }
  return applyLogsRemoteConfiguration(initConfiguration, fetchResult.value)
}
