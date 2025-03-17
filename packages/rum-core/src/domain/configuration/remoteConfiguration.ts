import { display, addEventListener, buildEndpointHost } from '@flashcatcloud/browser-core'
import type { RumInitConfiguration } from './configuration'

const REMOTE_CONFIGURATION_VERSION = 'v1'

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
  return { ...initConfiguration, ...remoteInitConfiguration }
}

export function fetchRemoteConfiguration(
  configuration: RumInitConfiguration,
  callback: (remoteConfiguration: Partial<RumInitConfiguration>) => void
) {
  const xhr = new XMLHttpRequest()

  addEventListener(configuration, xhr, 'load', function () {
    if (xhr.status === 200) {
      const remoteConfiguration = JSON.parse(xhr.responseText)
      callback(remoteConfiguration.rum)
    } else {
      displayRemoteConfigurationFetchingError()
    }
  })

  addEventListener(configuration, xhr, 'error', function () {
    displayRemoteConfigurationFetchingError()
  })

  xhr.open('GET', buildEndpoint(configuration))
  xhr.send()
}

export function buildEndpoint(configuration: RumInitConfiguration) {
  return `https://sdk-configuration.${buildEndpointHost('rum', configuration)}/${REMOTE_CONFIGURATION_VERSION}/${encodeURIComponent(configuration.remoteConfigurationId!)}.json`
}

function displayRemoteConfigurationFetchingError() {
  display.error('Error fetching the remote configuration.')
}
