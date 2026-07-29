import { buildEndpointUrl } from '@datadog/js-core/transport'
import { globalObject } from '@datadog/js-core/util'
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

// Typed interface for the global inflight fetch registry so deduplication
// works across separate SDK bundles (e.g. RUM and Logs loaded as separate CDN
// scripts on the same page) and in service-worker environments where `window`
// is not available.
interface GlobalWithInflightFetches {
  __ddRcInflight?: Map<string, Promise<FetchRemoteConfigurationResult>>
}

function getInflightFetches(): Map<string, Promise<FetchRemoteConfigurationResult>> {
  const global = globalObject as GlobalWithInflightFetches
  if (!global.__ddRcInflight) {
    global.__ddRcInflight = new Map()
  }
  return global.__ddRcInflight
}

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

export function fetchRemoteConfiguration(
  options: RemoteConfigurationEndpointOptions
): Promise<FetchRemoteConfigurationResult> {
  const endpoint = buildEndpoint(options)
  const inflightFetches = getInflightFetches()

  if (!inflightFetches.has(endpoint)) {
    const promise = doFetchRemoteConfiguration(endpoint).finally(() => {
      inflightFetches.delete(endpoint)
      if (inflightFetches.size === 0) {
        delete (globalObject as GlobalWithInflightFetches).__ddRcInflight
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
