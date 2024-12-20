import type { DefaultPrivacyLevel } from '@datadog/browser-core'
import { display, addEventListener, getSiteShortName, assign } from '@datadog/browser-core'
import type { RumInitConfiguration } from './configuration'

export const REMOTE_CONFIGURATION_ORIGIN = 'http://dt887evijcmkm.cloudfront.net'
const REMOTE_CONFIGURATION_VERSION = 'v1'

export interface RemoteConfigurationEvent {
  rum: {
    application_id: string
    service?: string
    version?: string
    session_sample_rate?: number
    session_replay_sample_rate?: number
    default_privacy_level?: DefaultPrivacyLevel
    enable_privacy_for_action_name?: boolean
  }
}

/**
 * Fetches and applies the remote configuration.
 * The logic enables adding new options without requiring code updates.
 *
 * - `snakeToCamelCaseKeys` is used to transform the RC event into a partial RUM init configuration.
 * - `assign` is used to merge the remote configuration with the existing RUM init configuration.
 *
 */
export function fetchAndApplyRemoteConfiguration(
  initConfiguration: RumInitConfiguration,
  callback: (initConfiguration: RumInitConfiguration) => void
) {
  fetchRemoteConfiguration(initConfiguration, (remoteInitConfiguration) => {
    callback(applyRemoteConfiguration(initConfiguration, remoteInitConfiguration))
  })
}

export function applyRemoteConfiguration(
  initConfiguration: RumInitConfiguration,
  remoteInitConfiguration: Partial<RumInitConfiguration>
) {
  return assign({}, initConfiguration, remoteInitConfiguration)
}

export function fetchRemoteConfiguration(
  configuration: RumInitConfiguration,
  callback: (remoteConfiguration: Partial<RumInitConfiguration>) => void
) {
  const xhr = new XMLHttpRequest()

  addEventListener(configuration, xhr, 'load', function () {
    if (xhr.status === 200) {
      const remoteConfigurationEvent = JSON.parse(xhr.responseText)
      const remoteConfiguration = snakeToCamelCase(remoteConfigurationEvent.rum)
      callback(remoteConfiguration)
    } else {
      displayRemoteConfigurationFetchingError()
    }
  })

  addEventListener(configuration, xhr, 'error', function () {
    displayRemoteConfigurationFetchingError()
  })

  xhr.open('GET', buildRemoteConfigurationUrl(configuration))
  xhr.send()
}

function buildRemoteConfigurationUrl(configuration: RumInitConfiguration) {
  return `${REMOTE_CONFIGURATION_ORIGIN}/${getSiteShortName(configuration.site)}/${REMOTE_CONFIGURATION_VERSION}/${encodeURIComponent(configuration.remoteConfigurationId!)}.json`
}

function displayRemoteConfigurationFetchingError() {
  display.error('Error fetching the remote configuration.')
}

function snakeToCamelCase(obj: object): any {
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).reduce(
      (acc, [key, value]) => {
        const camelKey = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()) // Convert to camelCase
        acc[camelKey] = snakeToCamelCase(value)
        return acc
      },
      {} as Record<string, any>
    )
  }
  return obj
}
