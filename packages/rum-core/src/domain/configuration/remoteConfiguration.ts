import type { createContextManager, Context } from '@datadog/browser-core'
import {
  display,
  buildEndpointHost,
  mapValues,
  getCookie,
  addTelemetryMetrics,
  TelemetryMetrics,
} from '@datadog/browser-core'
import type { RumInitConfiguration } from './configuration'
import type { RumSdkConfig, DynamicOption, ContextItem } from './remoteConfiguration.types'
import { parseJsonPath } from './jsonPathParser'

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

interface SupportedContextManagers {
  user: ReturnType<typeof createContextManager>
  context: ReturnType<typeof createContextManager>
}

export interface RemoteConfigurationMetrics extends Context {
  fetch: RemoteConfigurationMetricCounters
  cookie?: RemoteConfigurationMetricCounters
  dom?: RemoteConfigurationMetricCounters
  js?: RemoteConfigurationMetricCounters
}

interface RemoteConfigurationMetricCounters {
  success?: number
  missing?: number
  failure?: number
  [key: string]: number | undefined
}

export async function fetchAndApplyRemoteConfiguration(
  initConfiguration: RumInitConfiguration,
  supportedContextManagers: SupportedContextManagers
) {
  let rumInitConfiguration: RumInitConfiguration | undefined
  const metrics = initMetrics()
  const fetchResult = await fetchRemoteConfiguration(initConfiguration)
  if (!fetchResult.ok) {
    metrics.increment('fetch', 'failure')
    display.error(fetchResult.error)
  } else {
    metrics.increment('fetch', 'success')
    rumInitConfiguration = applyRemoteConfiguration(
      initConfiguration,
      fetchResult.value,
      supportedContextManagers,
      metrics
    )
  }
  // monitor-until: forever
  addTelemetryMetrics(TelemetryMetrics.REMOTE_CONFIGURATION_METRIC_NAME, { metrics: metrics.get() })
  return rumInitConfiguration
}

export function applyRemoteConfiguration(
  initConfiguration: RumInitConfiguration,
  rumRemoteConfiguration: RumRemoteConfiguration & { [key: string]: unknown },
  supportedContextManagers: SupportedContextManagers,
  metrics: ReturnType<typeof initMetrics>
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

  // share context to access metrics

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

  function resolveContextProperty(
    contextManager: ReturnType<typeof createContextManager>,
    contextItems: ContextItem[]
  ) {
    contextItems.forEach(({ key, value }) => {
      contextManager.setContextProperty(key, resolveConfigurationProperty(value))
    })
  }

  function resolveDynamicOption(property: DynamicOption) {
    const strategy = property.strategy
    let resolvedValue: unknown
    switch (strategy) {
      case 'cookie':
        resolvedValue = resolveCookieValue(property)
        break
      case 'dom':
        resolvedValue = resolveDomValue(property)
        break
      case 'js':
        resolvedValue = resolveJsValue(property)
        break
      default:
        display.error(`Unsupported remote configuration: "strategy": "${strategy as string}"`)
        return
    }
    const extractor = property.extractor
    if (extractor !== undefined && typeof resolvedValue === 'string') {
      return extractValue(extractor, resolvedValue)
    }
    return resolvedValue
  }

  function resolveCookieValue({ name }: { name: string }) {
    const value = getCookie(name)
    metrics.increment('cookie', value !== undefined ? 'success' : 'missing')
    return value
  }

  function resolveDomValue({ selector, attribute }: { selector: string; attribute?: string }) {
    let element: Element | null
    try {
      element = document.querySelector(selector)
    } catch {
      display.error(`Invalid selector in the remote configuration: '${selector}'`)
      metrics.increment('dom', 'failure')
      return
    }
    if (!element) {
      metrics.increment('dom', 'missing')
      return
    }
    if (isForbidden(element, attribute)) {
      display.error(`Forbidden element selected by the remote configuration: '${selector}'`)
      metrics.increment('dom', 'failure')
      return
    }
    const domValue = attribute !== undefined ? element.getAttribute(attribute) : element.textContent
    if (domValue === null) {
      metrics.increment('dom', 'missing')
      return
    }
    metrics.increment('dom', 'success')
    return domValue
  }

  function isForbidden(element: Element, attribute: string | undefined) {
    return element.getAttribute('type') === 'password' && attribute === 'value'
  }

  function resolveJsValue({ path }: { path: string }): unknown {
    let current = window as unknown as { [key: string]: unknown }
    const pathParts = parseJsonPath(path)
    if (pathParts.length === 0) {
      display.error(`Invalid JSON path in the remote configuration: '${path}'`)
      metrics.increment('js', 'failure')
      return
    }
    for (const pathPart of pathParts) {
      if (!(pathPart in current)) {
        metrics.increment('js', 'missing')
        return
      }
      try {
        current = current[pathPart] as { [key: string]: unknown }
      } catch (e) {
        display.error(`Error accessing: '${path}'`, e)
        metrics.increment('js', 'failure')
        return
      }
    }
    metrics.increment('js', 'success')
    return current
  }
}

export function initMetrics() {
  const metrics: RemoteConfigurationMetrics = { fetch: {} }
  return {
    get: () => metrics,
    increment: (metricName: 'fetch' | DynamicOption['strategy'], type: keyof RemoteConfigurationMetricCounters) => {
      if (!metrics[metricName]) {
        metrics[metricName] = {}
      }
      if (!metrics[metricName][type]) {
        metrics[metricName][type] = 0
      }
      metrics[metricName][type] = metrics[metricName][type] + 1
    },
  }
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
