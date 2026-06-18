import { timeStampNow } from '../entries/time'
import { normalizeUrl } from '../entries/util'
import type { Site } from './intakeSites'
import { INTAKE_SITE_US1 } from './intakeSites'

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

export type ProxyFn = (options: { path: string; parameters: string; subdomain?: string }) => string

export interface RetryInfo {
  count: number
  lastFailureStatus: number
}

export interface EndpointPayload {
  retry?: RetryInfo
  encoding?: 'deflate'
}

interface EndpointBuilderConfiguration {
  clientToken: string
  proxy?: string | ProxyFn
  site?: Site
  source?: TransportSource
}

interface ReplicaConfiguration {
  clientToken: string
  applicationId?: string
}

interface ConfigurationWithReplica {
  replica?: ReplicaConfiguration
  proxy?: string | ProxyFn
  source?: TransportSource
}

export type EndpointBuilder = ReturnType<typeof createEndpointBuilder>

export function createEndpointBuilder(
  configuration: EndpointBuilderConfiguration,
  trackType: TrackType,
  extraParameters?: string[]
) {
  return {
    build(api: ApiType, payload: EndpointPayload) {
      return buildEndpointUrl({
        proxy: configuration.proxy,
        site: configuration.site,
        path: `/api/v2/${trackType}`,
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
  { replica, proxy, source }: ConfigurationWithReplica,
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
}

export function buildEndpointUrl({
  proxy,
  site = INTAKE_SITE_US1,
  path,
  parameters = '',
  subdomain,
}: BuildEndpointUrlOptions): string {
  let pathAndParameters = path
  if (parameters) {
    pathAndParameters += `?${parameters}`
  }

  if (typeof proxy === 'string') {
    let url = `${normalizeUrl(proxy)}?ddforward=${encodeURIComponent(pathAndParameters)}`
    if (subdomain) {
      url += `&ddforwardSubdomain=${subdomain}`
    }
    return url
  }

  if (typeof proxy === 'function') {
    return proxy({ path, parameters, subdomain })
  }

  const domainParts = site.split('.')
  const extension = domainParts.pop()
  let domain = `browser-intake-${domainParts.join('-')}.${extension!}`
  if (subdomain) {
    domain = `${subdomain}.${domain}`
  }

  return `https://${domain}${pathAndParameters}`
}

/**
 * Build parameters to be used for an intake request. Parameters should be re-built for each
 * request, as they change randomly.
 */
function buildEndpointParameters(
  { clientToken, source = 'browser' }: EndpointBuilderConfiguration,
  trackType: TrackType,
  api: ApiType,
  { retry, encoding }: EndpointPayload,
  extraParameters: string[] = []
) {
  const parameters = [
    `ddsource=${source}`,
    `dd-api-key=${clientToken}`,
    `dd-evp-origin-version=${encodeURIComponent(__BUILD_ENV__SDK_VERSION__)}`,
    'dd-evp-origin=browser',
    `dd-request-id=${generateUUID()}`,
  ].concat(extraParameters)

  if (encoding) {
    parameters.push(`dd-evp-encoding=${encoding}`)
  }

  if (trackType === 'rum') {
    parameters.push(`batch_time=${timeStampNow()}`, `_dd.api=${api}`)

    if (retry) {
      parameters.push(`_dd.retry_count=${retry.count}`, `_dd.retry_after=${retry.lastFailureStatus}`)
    }
  }

  return parameters.join('&')
}

/**
 * UUID v4
 * from https://gist.github.com/jed/982883
 */
function generateUUID(placeholder?: string): string {
  return placeholder
    ? // eslint-disable-next-line  no-bitwise
      (parseInt(placeholder, 10) ^ ((Math.random() * 16) >> (parseInt(placeholder, 10) / 4))).toString(16)
    : `${1e7}-${1e3}-${4e3}-${8e3}-${1e11}`.replace(/[018]/g, generateUUID)
}
