import { display, buildEndpointHost, getCookie, isIndexableObject, fetch } from '@datadog/browser-core'
import type { RumSdkConfig, DynamicOption } from './remoteConfiguration.types'
import { parseJsonPath } from './jsonPathParser'

export type RemoteConfiguration = RumSdkConfig
export type RumRemoteConfiguration = Exclude<RemoteConfiguration['rum'], undefined>

export type RemoteConfigResult = { ok: true; value: RumRemoteConfiguration } | { ok: false; error: Error }

const REMOTE_CONFIGURATION_VERSION = 'v1'

/**
 * Fetch remote configuration from Datadog servers.
 *
 * @param options - Configuration options for fetching remote configuration
 * @param options.applicationId - Datadog application ID
 * @param options.remoteConfigurationId - Remote configuration ID
 * @param options.remoteConfigurationProxy - Optional proxy URL for remote configuration
 * @param options.site - Optional Datadog site
 * @param options.signal - Optional AbortSignal for cancellation
 * @returns Promise with result containing the remote configuration or error
 * @example
 * ```ts
 * const result = await fetchRemoteConfiguration({
 *   applicationId: 'abc123',
 *   remoteConfigurationId: '0e008b1b-8600-4709-9d1d-f4edcfdf5587'
 * })
 *
 * if (result.ok) {
 *   console.log(result.value?.rum)
 * } else {
 *   console.error(result.error)
 * }
 * ```
 */
export async function fetchRemoteConfiguration(options: {
  applicationId: string
  remoteConfigurationId: string
  remoteConfigurationProxy?: string
  site?: string
  signal?: AbortSignal
}): Promise<RemoteConfigResult> {
  let response: Response | undefined
  try {
    response = await fetch(buildEndpoint(options), { signal: options.signal })
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

/**
 * Build the endpoint URL for remote configuration fetch.
 *
 * @param options - Configuration options
 * @param options.applicationId - Datadog application ID
 * @param options.remoteConfigurationId - Remote configuration ID
 * @param options.remoteConfigurationProxy - Optional proxy URL for remote configuration
 * @param options.site - Optional Datadog site
 * @returns The endpoint URL
 * @example
 * ```ts
 * const url = buildEndpoint({
 *   applicationId: 'abc123',
 *   remoteConfigurationId: '0e008b1b-8600-4709-9d1d-f4edcfdf5587'
 * })
 * // => 'https://sdk-configuration.datadoghq.com/v1/0e008b1b-8600-4709-9d1d-f4edcfdf5587.json'
 * ```
 */
export function buildEndpoint(options: {
  applicationId: string
  remoteConfigurationId: string
  remoteConfigurationProxy?: string
  site?: string
}): string {
  if (options.remoteConfigurationProxy) {
    return options.remoteConfigurationProxy
  }
  // buildEndpointHost only uses `site` from the config, but its signature requires full InitConfiguration.
  // We use a targeted type assertion since we only need the site for building the host.
  const host = buildEndpointHost('rum', { site: options.site } as { site: string | undefined; clientToken: string })
  return `https://sdk-configuration.${host}/${REMOTE_CONFIGURATION_VERSION}/${encodeURIComponent(options.remoteConfigurationId)}.json`
}

// ==========================================
// Below are internal helper functions used by rum-core for applying remote configuration
// Exposed for testing and advanced use cases
// ==========================================

/**
 * Resolve dynamic configuration values (cookies, DOM selectors, JS paths).
 * This is exposed for internal SDK use and advanced test scenarios.
 *
 * @internal
 */
export function resolveDynamicValues(
  configValue: unknown,
  options: {
    onCookie?: (value: string | undefined) => void
    onDom?: (value: string | null | undefined) => void
    onJs?: (value: unknown) => void
  } = {}
): unknown {
  if (Array.isArray(configValue)) {
    return configValue.map((item) => resolveDynamicValues(item, options))
  }
  if (isIndexableObject(configValue)) {
    if (isSerializedOption(configValue)) {
      const type = (configValue as any).rcSerializedType
      switch (type) {
        case 'string':
          return (configValue as any).value
        case 'regex':
          return resolveRegex((configValue as any).value as string)
        case 'dynamic':
          return resolveDynamicOption(configValue as DynamicOption, options)
        default:
          display.error(`Unsupported remote configuration: "rcSerializedType": "${type as string}"`)
          return
      }
    }
    const result: { [key: string]: unknown } = {}
    for (const key in configValue) {
      if (Object.prototype.hasOwnProperty.call(configValue, key)) {
        result[key] = resolveDynamicValues(configValue[key], options)
      }
    }
    return result
  }
  return configValue
}

function resolveDynamicOption(
  property: DynamicOption,
  options: {
    onCookie?: (value: string | undefined) => void
    onDom?: (value: string | null | undefined) => void
    onJs?: (value: unknown) => void
  }
): unknown {
  const strategy = property.strategy
  let resolvedValue: unknown
  switch (strategy) {
    case 'cookie':
      resolvedValue = resolveCookieValue(property, options)
      break
    case 'dom':
      resolvedValue = resolveDomValue(property, options)
      break
    case 'js':
      resolvedValue = resolveJsValue(property, options)
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

function resolveCookieValue(
  { name }: { name: string },
  options: { onCookie?: (value: string | undefined) => void } = {}
) {
  const value = getCookie(name)
  options.onCookie?.(value)
  return value
}

function resolveDomValue(
  { selector, attribute }: { selector: string; attribute?: string },
  options: { onDom?: (value: string | null | undefined) => void } = {}
) {
  let element: Element | null
  try {
    element = document.querySelector(selector)
  } catch {
    display.error(`Invalid selector in the remote configuration: '${selector}'`)
    options.onDom?.(undefined)
    return
  }
  if (!element) {
    options.onDom?.(undefined)
    return
  }
  if (isForbidden(element, attribute)) {
    display.error(`Forbidden element selected by the remote configuration: '${selector}'`)
    options.onDom?.(undefined)
    return
  }
  const domValue = attribute !== undefined ? element.getAttribute(attribute) : element.textContent
  options.onDom?.(domValue)
  return domValue
}

function isForbidden(element: Element, attribute: string | undefined) {
  return element.getAttribute('type') === 'password' && attribute === 'value'
}

function resolveJsValue({ path }: { path: string }, options: { onJs?: (value: unknown) => void } = {}): unknown {
  let current = window as unknown as { [key: string]: unknown }
  const pathParts = parseJsonPath(path)
  if (pathParts.length === 0) {
    display.error(`Invalid JSON path in the remote configuration: '${path}'`)
    options.onJs?.(undefined)
    return
  }
  for (const pathPart of pathParts) {
    if (!(pathPart in current)) {
      options.onJs?.(undefined)
      return
    }
    try {
      current = current[pathPart] as { [key: string]: unknown }
    } catch (e) {
      display.error(`Error accessing: '${path}'`, e)
      options.onJs?.(undefined)
      return
    }
  }
  options.onJs?.(current)
  return current
}

function resolveRegex(pattern: string): RegExp | undefined {
  try {
    return new RegExp(pattern)
  } catch {
    display.error(`Invalid regex in the remote configuration: '${pattern}'`)
  }
}

function extractValue(extractor: { value: string }, candidate: string) {
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

function isSerializedOption(value: object): value is { rcSerializedType: string; [key: string]: unknown } {
  return 'rcSerializedType' in value
}
