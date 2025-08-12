import type { createContextManager } from '@datadog/browser-core'
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

const enum SupportedContexts {
  user = 'user',
  context = 'context',
}

type SupportedContextManagers = {
  [key in SupportedContexts]: ReturnType<typeof createContextManager>
}

export async function fetchAndApplyRemoteConfiguration(
  initConfiguration: RumInitConfiguration,
  supportedContextManagers: SupportedContextManagers
) {
  const fetchResult = await fetchRemoteConfiguration(initConfiguration)
  if (!fetchResult.ok) {
    display.error(fetchResult.error)
    return
  }
  return applyRemoteConfiguration(initConfiguration, fetchResult.value, supportedContextManagers)
}

export function applyRemoteConfiguration(
  initConfiguration: RumInitConfiguration,
  rumRemoteConfiguration: RumRemoteConfiguration & { [key: string]: unknown },
  supportedContextManagers: SupportedContextManagers
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
  ;(Object.keys(supportedContextManagers) as Array<keyof SupportedContextManagers>).forEach((context) => {
    if (rumRemoteConfiguration[context] !== undefined) {
      resolveContextProperty(supportedContextManagers[context], rumRemoteConfiguration[context])
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

function resolveContextProperty(
  contextManager: ReturnType<typeof createContextManager>,
  contextConfiguration: RumRemoteConfiguration[SupportedContexts] & { [key: string]: unknown }
) {
  Object.keys(contextConfiguration).forEach((key) => {
    if (key === 'additionals') {
      contextConfiguration[key]?.forEach((additional) => {
        contextManager.setContextProperty(additional.key, resolveConfigurationProperty(additional.value))
      })
    } else {
      contextManager.setContextProperty(key, resolveConfigurationProperty(contextConfiguration[key]))
    }
  })
}

function resolveDynamicOption(property: DynamicOption) {
  const strategy = property.strategy
  switch (strategy) {
    case 'cookie':
      return resolveCookieValue(property)
    case 'dom':
      return resolveDomValue(property)
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

function resolveDomValue({
  selector,
  attribute,
  extractor,
}: {
  selector: string
  attribute?: string
  extractor?: SerializedRegex
}) {
  let element: Element | null
  try {
    element = document.querySelector(selector)
  } catch {
    element = null
    display.error(`Invalid selector in the remote configuration: '${selector}'`)
  }
  if (element === null || isForbidden(element, attribute)) {
    return
  }
  const domValue = attribute !== undefined ? element.getAttribute(attribute) : element.textContent
  if (extractor !== undefined && domValue !== null) {
    return extractValue(extractor, domValue)
  }
  return domValue ?? undefined
}

function isForbidden(element: Element, attribute: string | undefined) {
  return element.getAttribute('type') === 'password' && attribute === 'value'
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
