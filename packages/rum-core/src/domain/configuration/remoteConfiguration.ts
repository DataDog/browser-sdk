import { display, buildEndpointHost } from '@datadog/browser-core'
import type { RumInitConfiguration } from './configuration'
import type { RumSdkConfig } from './remoteConfiguration.types'

export type RemoteConfiguration = RumSdkConfig
type RumRemoteConfiguration = Exclude<RemoteConfiguration['rum'], undefined>
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

export async function fetchAndApplyRemoteConfiguration(initConfiguration: RumInitConfiguration) {
  const fetchResult = await fetchRemoteConfiguration(initConfiguration)
  if (!fetchResult.ok) {
    display.error(fetchResult.error)
    return
  }
  return applyRemoteConfiguration(initConfiguration, fetchResult.value)
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

type FetchRemoteConfigurationResult = { ok: true; value: RumRemoteConfiguration } | { ok: false; error: Error }

export async function fetchRemoteConfiguration(
  configuration: RumInitConfiguration
): Promise<FetchRemoteConfigurationResult> {
  let response: Response | undefined
  try {
    response = await fetch(buildEndpoint(configuration))
  } catch {
    response = undefined
  }
  if (!response || !response.ok) {
    return {
      ok: false,
      error: new Error('Error fetching the remote configuration.'),
    }
  }
  const remoteConfiguration: RemoteConfiguration = await response.json()
  if (remoteConfiguration.rum) {
    return {
      ok: true,
      value: remoteConfiguration.rum,
    }
  }
  return {
    ok: false,
    error: new Error('No remote configuration for RUM.'),
  }
}

export function buildEndpoint(configuration: RumInitConfiguration) {
  if (configuration.remoteConfigurationProxy) {
    return configuration.remoteConfigurationProxy
  }
  return `https://sdk-configuration.${buildEndpointHost('rum', configuration)}/${REMOTE_CONFIGURATION_VERSION}/${encodeURIComponent(configuration.remoteConfigurationId!)}.json`
}
