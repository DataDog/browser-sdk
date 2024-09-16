import type { DefaultPrivacyLevel } from '@datadog/browser-core'
import { display, assign } from '@datadog/browser-core'
import type { RumInitConfiguration } from './configuration'

export const REMOTE_CONFIGURATION_URL = 'https://d3uc069fcn7uxw.cloudfront.net/configuration'

export interface RumRemoteConfiguration {
  sessionSampleRate?: number
  sessionReplaySampleRate?: number
  defaultPrivacyLevel?: DefaultPrivacyLevel
}

export async function fetchAndApplyRemoteConfiguration(
  initConfiguration: RumInitConfiguration
): Promise<RumInitConfiguration | undefined> {
  const remoteConfiguration = await fetchRemoteConfiguration(initConfiguration)
  if (!remoteConfiguration) {
    return
  }
  return applyRemoteConfiguration(initConfiguration, remoteConfiguration)
}

export function applyRemoteConfiguration(
  initConfiguration: RumInitConfiguration,
  remoteInitConfiguration: RumRemoteConfiguration
) {
  return assign({}, initConfiguration, remoteInitConfiguration)
}

export async function fetchRemoteConfiguration(
  configuration: RumInitConfiguration
): Promise<RumRemoteConfiguration | undefined> {
  try {
    const response = await fetch(
      `${REMOTE_CONFIGURATION_URL}/${encodeURIComponent(configuration.remoteConfigurationId!)}.json`
    )

    if (!response.ok) {
      displayRemoteConfigurationFetchingError()
    }
    return (await response.json()) as RumRemoteConfiguration
  } catch (error) {
    displayRemoteConfigurationFetchingError()
  }
}

function displayRemoteConfigurationFetchingError() {
  display.error('Error fetching the remote configuration.')
}
