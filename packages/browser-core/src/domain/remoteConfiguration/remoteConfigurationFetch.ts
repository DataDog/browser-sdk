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

export async function fetchRemoteConfiguration(
  options: RemoteConfigurationEndpointOptions
): Promise<FetchRemoteConfigurationResult> {
  let response: Response | undefined
  try {
    response = await fetch(buildEndpoint(options))
  } catch {
    response = undefined
  }
  if (!response?.ok) {
    return { ok: false, error: new Error('Error fetching the remote configuration.') }
  }
  const value: RemoteConfiguration = await response.json()
  return { ok: true, value }
}
