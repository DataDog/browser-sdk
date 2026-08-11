import { timeStampNow } from '../entries/time'
import { normalizeUrl } from '../entries/util'
import type { Site } from './intakeSites'
import { INTAKE_SITE_US1 } from './intakeSites'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

/** The Datadog backend track a request is being sent to. */
export type TrackType = 'logs' | 'rum' | 'replay' | 'profile' | 'exposures' | 'flagevaluation' | 'debugger'

/** The mechanism used to send a request to an intake endpoint. */
export type TransportApiType =
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

/** A function that builds a proxy URL for an intake request. */
export type ProxyFn = (options: { path: string; parameters: string; subdomain?: string }) => string

/** Metadata about a request retry attempt. */
export interface TransportRetryInfo {
  /** Number of retry attempts so far. */
  count: number
  /** HTTP status code of the last failed attempt. */
  lastFailureStatus: number
}

/** The data and metadata associated with a single intake request. */
export interface EndpointPayload {
  /** Present when this is a retry; carries the previous attempt's metadata. */
  retry?: TransportRetryInfo
  /** Compression applied to the payload body, if any. */
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

/** Builds intake URLs for a specific track. */
export interface EndpointBuilder {
  /** Builds the intake URL for the given API type and payload metadata. */
  build(api: TransportApiType, payload: EndpointPayload): string
  /** The track this builder targets. */
  trackType: TrackType
}

/** Creates an {@link EndpointBuilder} for the given track type. */
export function createEndpointBuilder(
  configuration: EndpointBuilderConfiguration,
  trackType: TrackType,
  extraParameters?: string[]
): EndpointBuilder {
  return {
    build(api: TransportApiType, payload: EndpointPayload) {
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
): EndpointBuilder | undefined {
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

/** Options for building a Datadog intake URL. */
export interface BuildEndpointUrlOptions {
  /** Optional proxy URL or function to route intake requests through. */
  proxy?: string | ProxyFn
  /** Target Datadog site. Defaults to `INTAKE_SITE_US1` when undefined. */
  site: Site | undefined
  /** Optional subdomain prepended to the intake domain (e.g. `'sdk-configuration'`). */
  subdomain?: string
  /** The API path (e.g. `/api/v2/rum`). */
  path: string
  /** Pre-built query string appended to the URL, without a leading `?`. */
  parameters?: string
}

/** Builds a Datadog intake URL from the given options. */
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
  api: TransportApiType,
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
