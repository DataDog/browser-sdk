import { buildEndpointUrl } from '@datadog/js-core/transport'
import { fetch } from '../../browser/fetch'
import type { RumSdkConfig } from './remoteConfiguration.types'

export type RemoteConfiguration = RumSdkConfig

const REMOTE_CONFIGURATION_VERSION = 'v1'

export interface RemoteConfigurationEndpointOptions {
  site?: string | undefined
  remoteConfigurationId?: string | undefined
  remoteConfigurationProxy?: string | undefined
  remoteConfiguration?: { id?: string } | undefined
}

export type FetchRemoteConfigurationResult = { ok: true; value: RemoteConfiguration } | { ok: false; error: Error }

export function getRemoteConfigurationId(options: RemoteConfigurationEndpointOptions): string | undefined {
  return options.remoteConfiguration?.id ?? options.remoteConfigurationId
}

export function buildEndpoint(options: RemoteConfigurationEndpointOptions): string {
  if (options.remoteConfigurationProxy) {
    return options.remoteConfigurationProxy
  }
  const id = getRemoteConfigurationId(options)!
  return buildEndpointUrl({
    site: options.site!,
    path: `/${REMOTE_CONFIGURATION_VERSION}/${encodeURIComponent(id)}.json`,
    subdomain: 'sdk-configuration',
  })
}

// Use a window-level registry so deduplication works across separate SDK bundles
// (e.g. RUM and Logs loaded as separate CDN scripts on the same page).
const INFLIGHT_FETCHES_KEY = '__ddRcInflight'

function getInflightFetches(): Map<string, Promise<FetchRemoteConfigurationResult>> {
  const win = window as unknown as Record<string, unknown>
  if (!win[INFLIGHT_FETCHES_KEY]) {
    win[INFLIGHT_FETCHES_KEY] = new Map<string, Promise<FetchRemoteConfigurationResult>>()
  }
  return win[INFLIGHT_FETCHES_KEY] as Map<string, Promise<FetchRemoteConfigurationResult>>
}

export function fetchRemoteConfiguration(
  options: RemoteConfigurationEndpointOptions
): Promise<FetchRemoteConfigurationResult> {
  const endpoint = buildEndpoint(options)
  const inflightFetches = getInflightFetches()

  if (!inflightFetches.has(endpoint)) {
    const win = window as unknown as Record<string, unknown>
    const promise = doFetchRemoteConfiguration(endpoint).finally(() => {
      inflightFetches.delete(endpoint)
      if (inflightFetches.size === 0) {
        delete win[INFLIGHT_FETCHES_KEY]
      }
    })
    inflightFetches.set(endpoint, promise)
  }

  return inflightFetches.get(endpoint)!
}

async function doFetchRemoteConfiguration(endpoint: string): Promise<FetchRemoteConfigurationResult> {
  let response: Response | undefined
  try {
    response = await fetch(endpoint)
  } catch {
    response = undefined
  }
  if (!response?.ok) {
    return { ok: false, error: new Error('Error fetching the remote configuration.') }
  }
  try {
    const value: RemoteConfiguration = await response.json()
    return { ok: true, value }
  } catch {
    return { ok: false, error: new Error('Error parsing the remote configuration.') }
  }
}
