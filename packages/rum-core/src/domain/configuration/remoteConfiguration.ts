import type { DefaultPrivacyLevel } from '@datadog/browser-core'
import { display, addEventListener, getSiteShortName, assign } from '@datadog/browser-core'
import type { RumInitConfiguration } from './configuration'

export const REMOTE_CONFIGURATION_ORIGIN = 'http://dt887evijcmkm.cloudfront.net'
const REMOTE_CONFIGURATION_VERSION = 'v1'

export interface RumRemoteConfiguration {
  sessionSampleRate?: number
  sessionReplaySampleRate?: number
  defaultPrivacyLevel?: DefaultPrivacyLevel
}

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
  remoteInitConfiguration: RumRemoteConfiguration
) {
  return assign({}, initConfiguration, remoteInitConfiguration)
}

export function fetchRemoteConfiguration(
  configuration: RumInitConfiguration,
  callback: (remoteConfiguration: RumRemoteConfiguration) => void
) {
  const xhr = new XMLHttpRequest()

  addEventListener(configuration, xhr, 'load', function () {
    if (xhr.status === 200) {
      callback(JSON.parse(xhr.responseText))
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
