import type { Payload } from '../../transport'
import { timeStampNow } from '../../tools/utils/timeUtils'
import { normalizeUrl } from '../../tools/utils/urlPolyfill'
import { generateUUID } from '../../tools/utils/stringUtils'
import type { Site } from '../intakeSites'
import { INTAKE_SITE_US1 } from '../intakeSites'
import type { InitConfiguration, ProxyFn } from './configuration'

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
 * `InitConfiguration.source`. It can only be supplied by passing it as the
 * `sourceOverride` argument of `computeTransportConfiguration`.
 */
export type TransportSource = 'browser' | 'flutter' | 'unity' | 'dd_debugger'

// Internal: the endpoint builder accepts a wider `source` than the public
// `InitConfiguration.source` so that `computeTransportConfiguration` can pass
// the validated/overridden transport source through to URL building.
type EndpointBuilderInitConfiguration = Omit<InitConfiguration, 'source'> & {
  source?: TransportSource
}

export type EndpointBuilder = ReturnType<typeof createEndpointBuilder>

export function createEndpointBuilder(
  initConfiguration: EndpointBuilderInitConfiguration,
  trackType: TrackType,
  extraParameters?: string[]
) {
  return {
    build(api: ApiType, payload: Payload) {
      return buildEndpointUrl({
        proxy: initConfiguration.proxy,
        site: initConfiguration.site,
        path: `/api/v2/${trackType}`,
        parameters: buildEndpointParameters(initConfiguration, trackType, api, payload, extraParameters),
      })
    },
    trackType,
  }
}

export interface BuildEndpointUrlOptions {
  proxy?: string | ProxyFn
  site: Site | undefined
  subdomain?: string
  path: string
  parameters: string
}

export function buildEndpointUrl({
  proxy,
  site = INTAKE_SITE_US1,
  path,
  parameters,
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
  { clientToken, source = 'browser' }: EndpointBuilderInitConfiguration,
  trackType: TrackType,
  api: ApiType,
  { retry, encoding }: Payload,
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
