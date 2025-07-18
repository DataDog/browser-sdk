import { display, addEventListener, buildEndpointHost } from '@datadog/browser-core'
import type { RumInitConfiguration } from './configuration'
import type { RumSdkConfig } from './remoteConfig.types'

type RumRemoteConfiguration = Exclude<RumSdkConfig['rum'], undefined>
const REMOTE_CONFIGURATION_VERSION = 'v1'
const STATIC_OPTIONS: Array<keyof RumInitConfiguration> = [
  'applicationId',
  'service',
  'env',
  'version',
  'sessionSampleRate',
  'sessionReplaySampleRate',
  'defaultPrivacyLevel',
  'enablePrivacyForActionName',
]

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
  rumRemoteConfiguration: RumRemoteConfiguration & { [key: string]: unknown }
): RumInitConfiguration {
  // intents:
  // - explicitly set each supported field to limit risk in case an attacker can create configurations
  // - check the existence in the remote config to avoid clearing a provided init field
  const appliedConfiguration = { ...initConfiguration } as RumInitConfiguration & { [key: string]: unknown }
  STATIC_OPTIONS.forEach((option: string) => {
    if (option in rumRemoteConfiguration) {
      appliedConfiguration[option] = rumRemoteConfiguration[option]
    }
  })
  return appliedConfiguration
}

export function fetchRemoteConfiguration(
  configuration: RumInitConfiguration,
  callback: (remoteConfiguration: RumRemoteConfiguration) => void
) {
  const xhr = new XMLHttpRequest()

  addEventListener(configuration, xhr, 'load', function () {
    if (xhr.status === 200) {
      const remoteConfiguration = JSON.parse(xhr.responseText) as RumSdkConfig
      if (remoteConfiguration.rum) {
        callback(remoteConfiguration.rum)
      } else {
        display.error('No remote configuration for RUM.')
      }
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
