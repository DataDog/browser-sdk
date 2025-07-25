import { display, buildEndpointHost, mapValues } from '@datadog/browser-core'
import type { RumInitConfiguration } from './configuration'
import type { RumSdkConfig, ComplexOption } from './remoteConfig.types'

type RumRemoteConfiguration = Exclude<RumSdkConfig['rum'], undefined>
const REMOTE_CONFIGURATION_VERSION = 'v1'
const SUPPORTED_FIELDS: Array<keyof RumInitConfiguration> = [
  'applicationId',
  'service',
  'env',
  'version',
  'sessionSampleRate',
  'sessionReplaySampleRate',
  'defaultPrivacyLevel',
  'enablePrivacyForActionName',
  'traceSampleRate',
  'trackSessionAcrossSubdomains',
  'allowedTracingUrls',
  'allowedTrackingOrigins',
]

export async function fetchAndApplyRemoteConfiguration(initConfiguration: RumInitConfiguration) {
  let remoteInitConfiguration: RumRemoteConfiguration
  try {
    remoteInitConfiguration = await fetchRemoteConfiguration(initConfiguration)
  } catch (error) {
    display.error(error)
    return
  }
  return applyRemoteConfiguration(initConfiguration, remoteInitConfiguration)
}

export function applyRemoteConfiguration(
  initConfiguration: RumInitConfiguration,
  rumRemoteConfiguration: RumRemoteConfiguration & { [key: string]: unknown }
): RumInitConfiguration {
  // intents:
  // - explicitly set each supported field to limit risk in case an attacker can create configurations
  // - check the existence in the remote config to avoid clearing a provided init field
  const appliedConfiguration = { ...initConfiguration } as RumInitConfiguration & { [key: string]: unknown }
  SUPPORTED_FIELDS.forEach((option: string) => {
    if (option in rumRemoteConfiguration) {
      appliedConfiguration[option] = resolveConfigurationProperty(rumRemoteConfiguration[option])
    }
  })
  return appliedConfiguration
}

function resolveConfigurationProperty(property: unknown): unknown {
  if (Array.isArray(property)) {
    return property.map(resolveConfigurationProperty)
  }
  if (isObject(property)) {
    if (isComplexOption(property)) {
      const $type = property.$type
      switch ($type) {
        case 'string':
          return property.value
        case 'regex':
          return resolveRegex(property)
        default:
          exhaustiveCheck($type)
      }
    }
    return mapValues(property, resolveConfigurationProperty)
  }
  return property
}

function isObject(property: unknown): property is { [key: string]: unknown } {
  return typeof property === 'object' && property !== null
}

function isComplexOption(value: object): value is ComplexOption {
  return '$type' in value
}

function exhaustiveCheck(never: never) {
  throw new Error(`Unsupported value: '${never as string}'`)
}

function resolveRegex(property: ComplexOption): RegExp | undefined {
  try {
    return new RegExp(property.value)
  } catch {
    display.error(`Invalid regex in the remote configuration: '${property.value}'`)
  }
}

export async function fetchRemoteConfiguration(configuration: RumInitConfiguration) {
  const FETCHING_ERROR_MESSAGE = 'Error fetching the remote configuration.'
  let response: Response
  try {
    response = await fetch(buildEndpoint(configuration))
  } catch {
    throw new Error(FETCHING_ERROR_MESSAGE)
  }
  if (!response.ok) {
    throw new Error(FETCHING_ERROR_MESSAGE)
  }
  const remoteConfiguration: RumSdkConfig = await response.json()
  if (remoteConfiguration.rum) {
    return remoteConfiguration.rum
  }
  throw new Error('No remote configuration for RUM.')
}

export function buildEndpoint(configuration: RumInitConfiguration) {
  if (configuration.remoteConfigurationProxy) {
    return configuration.remoteConfigurationProxy
  }
  return `https://sdk-configuration.${buildEndpointHost('rum', configuration)}/${REMOTE_CONFIGURATION_VERSION}/${encodeURIComponent(configuration.remoteConfigurationId!)}.json`
}
