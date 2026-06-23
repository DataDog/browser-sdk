import { timeStampNow } from '@openobserve/js-core/time'
import type { Payload } from '../../transport'
import { normalizeUrl } from '../../tools/utils/urlPolyfill'
import { generateUUID } from '../../tools/utils/stringUtils'
import type { Site } from '../intakeSites'
import { INTAKE_SITE_US1 } from '../intakeSites'
import type { Configuration, ProxyFn } from './configuration'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

export type TrackType = 'logs' | 'rum' | 'replay' | 'profile' | 'exposures' | 'flagevaluation' | 'debugger'
export type ApiType =
  | 'fetch'
  | 'beacon'
  // 'manual' reflects that the request have been sent manually, outside of the SDK (ex: via curl or
  // a Node.js script).
  | 'manual'

/**
 * Source values supported by the transport layer for the `ddsource` URL parameter.
 *
 * `'dd_debugger'` is internal to the Live Debugger SDK and is not part of
 * `InitConfiguration.source`. It is passed directly to `createEndpointBuilder`
 * by the debugger transport.
 */
export type TransportSource = 'browser' | 'flutter' | 'unity' | 'dd_debugger'

interface EndpointBuilderConfiguration {
  clientToken: string
  proxy?: string | ProxyFn
  site?: Site
  source?: TransportSource
  apiVersion?: string
  organizationIdentifier?: string
  insecureHTTP?: boolean
}

export type EndpointBuilder = ReturnType<typeof createEndpointBuilder>

export function createEndpointBuilder(
  configuration: EndpointBuilderConfiguration,
  trackType: TrackType,
  extraParameters?: string[]
) {
  return {
    build(api: ApiType, payload: Payload) {
      return buildEndpointUrl({
        proxy: configuration.proxy,
        site: configuration.site,
        insecureHTTP: configuration.insecureHTTP,
        path: `/rum/${configuration.apiVersion ?? 'v1'}/${configuration.organizationIdentifier}/${trackType}`,
        parameters: buildEndpointParameters(configuration, trackType, api, payload, extraParameters),
      })
    },
    trackType,
  }
}

/**
 * Build the endpoint for the replica (dual shipping) site, if a replica is configured.
 *
 * The replica always targets the US1 site but keeps the `proxy` and `source` of the main
 * configuration. The RUM track additionally carries the replica `application.id`.
 */
export function createReplicaEndpointBuilder(
  { replica, proxy, source, apiVersion, organizationIdentifier, insecureHTTP }: Configuration,
  trackType: TrackType
) {
  if (!replica) {
    return
  }
  return createEndpointBuilder(
    {
      clientToken: replica.clientToken,
      proxy,
      source,
      site: INTAKE_SITE_US1,
      apiVersion,
      organizationIdentifier,
      insecureHTTP,
    },
    trackType,
    trackType === 'rum' ? [`application.id=${replica.applicationId}`] : undefined
  )
}

export interface BuildEndpointUrlOptions {
  proxy?: string | ProxyFn
  site: Site | undefined
  subdomain?: string
  path: string
  parameters?: string
  insecureHTTP?: boolean
}

export function buildEndpointUrl({
  proxy,
  site = INTAKE_SITE_US1,
  path,
  parameters = '',
  subdomain,
  insecureHTTP,
}: BuildEndpointUrlOptions): string {
  let pathAndParameters = path
  if (parameters) {
    pathAndParameters += `?${parameters}`
  }

  if (typeof proxy === 'string') {
    let url = `${normalizeUrl(proxy)}?o2forward=${encodeURIComponent(pathAndParameters)}`
    if (subdomain) {
      url += `&o2forwardSubdomain=${subdomain}`
    }
    return url
  }

  if (typeof proxy === 'function') {
    return proxy({ path, parameters, subdomain })
  }

  // OpenObserve: `site` is the endpoint host itself; send to it directly.
  const protocol = insecureHTTP ? 'http' : 'https'
  return `${protocol}://${site}${pathAndParameters}`
}

/**
 * Build parameters to be used for an intake request. Parameters should be re-built for each
 * request, as they change randomly.
 */
function buildEndpointParameters(
  { clientToken, source = 'browser' }: EndpointBuilderConfiguration,
  trackType: TrackType,
  api: ApiType,
  { retry, encoding }: Payload,
  extraParameters: string[] = []
) {
  const parameters = [
    `o2source=${source}`,
    `o2-api-key=${clientToken}`,
    `o2-evp-origin-version=${encodeURIComponent(__BUILD_ENV__SDK_VERSION__)}`,
    'o2-evp-origin=browser',
    `o2-request-id=${generateUUID()}`,
  ].concat(extraParameters)

  if (encoding) {
    parameters.push(`o2-evp-encoding=${encoding}`)
  }

  if (trackType === 'rum') {
    parameters.push(`batch_time=${timeStampNow()}`, `_o2.api=${api}`)

    if (retry) {
      parameters.push(`_o2.retry_count=${retry.count}`, `_o2.retry_after=${retry.lastFailureStatus}`)
    }
  }

  return parameters.join('&')
}
