import { display, buildEndpointHost, mapValues, getCookie } from '@datadog/browser-core'
import type { RumInitConfiguration } from './configuration'
import type { RumSdkConfig, DynamicOption } from './remoteConfiguration.types'

export type RemoteConfiguration = RumSdkConfig
export type RumRemoteConfiguration = Exclude<RemoteConfiguration['rum'], undefined>
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

// type needed for switch on union
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type SerializedRegex = { rcSerializedType: 'regex'; value: string }
type SerializedOption = { rcSerializedType: 'string'; value: string } | SerializedRegex | DynamicOption

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
    if (isSerializedOption(property)) {
      const type = property.rcSerializedType
      switch (type) {
        case 'string':
          return property.value
        case 'regex':
          return resolveRegex(property.value)
        case 'dynamic':
          return resolveDynamicOption(property)
        default:
          display.error(`Unsupported remote configuration: "rcSerializedType": "${type as string}"`)
          return
      }
    }
    return mapValues(property, resolveConfigurationProperty)
  }
  return property
}

function isObject(property: unknown): property is { [key: string]: unknown } {
  return typeof property === 'object' && property !== null
}

function isSerializedOption(value: object): value is SerializedOption {
  return 'rcSerializedType' in value
}

function resolveRegex(pattern: string): RegExp | undefined {
  try {
    return new RegExp(pattern)
  } catch {
    display.error(`Invalid regex in the remote configuration: '${pattern}'`)
  }
}

function resolveDynamicOption(property: DynamicOption) {
  const strategy = property.strategy
  switch (strategy) {
    case 'cookie':
      return resolveCookieValue(property)
    default:
      display.error(`Unsupported remote configuration: "strategy": "${strategy as string}"`)
      return
  }
}

function resolveCookieValue({ name, extractor }: { name: string; extractor?: SerializedRegex }) {
  const cookieValue = getCookie(name)
  if (extractor !== undefined && cookieValue !== undefined) {
    return extractValue(extractor, cookieValue)
  }
  return cookieValue
}

function extractValue(extractor: SerializedRegex, candidate: string) {
  const resolvedExtractor = resolveRegex(extractor.value)
  if (resolvedExtractor === undefined) {
    return
  }
  const regexResult = resolvedExtractor.exec(candidate)
  if (regexResult === null) {
    return
  }
  const [match, capture] = regexResult
  return capture ? capture : match
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
