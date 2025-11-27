import type { Payload } from '../../transport'
import { timeStampNow } from '../../tools/utils/timeUtils'
import { normalizeUrl } from '../../tools/utils/urlPolyfill'
import { generateUUID } from '../../tools/utils/stringUtils'
import { INTAKE_SITE_FED_STAGING, INTAKE_SITE_US1, PCI_INTAKE_HOST_US1 } from '../intakeSites'
import type { Configuration, InitConfiguration, ReplicaUserConfiguration } from './configuration'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

export type TrackType = 'logs' | 'rum' | 'replay' | 'profile' | 'exposures'
export type ApiType =
  | 'fetch-keepalive'
  | 'fetch'
  | 'beacon'
  // 'manual' reflects that the request have been sent manually, outside of the SDK (ex: via curl or
  // a Node.js script).
  | 'manual'

export type EndpointBuilder = ReturnType<typeof createEndpointBuilder>

export type EndpointBuilderConfiguration = Pick<Configuration, 'proxy' | 'clientToken' | 'source'> &
  EndpointHostConfiguration

export type EndpointHostConfiguration = Pick<InitConfiguration, 'site' | 'internalAnalyticsSubdomain'> & {
  usePciIntake?: boolean
}

export function createEndpointBuilder(
  configuration: EndpointBuilderConfiguration,
  trackType: TrackType,
  extraParameters?: string[]
) {
  const buildUrlWithParameters = createEndpointUrlWithParametersBuilder(configuration, trackType)

  return {
    build(api: ApiType, payload: Payload) {
      const parameters = buildEndpointParameters(configuration, trackType, api, payload, extraParameters)
      return buildUrlWithParameters(parameters)
    },
    trackType,
  }
}

export function createReplicaEndpointBuilder(
  configuration: EndpointBuilderConfiguration,
  replicaConfiguration: ReplicaUserConfiguration,
  trackType: TrackType
) {
  return createEndpointBuilder(
    {
      ...configuration,
      site: INTAKE_SITE_US1,
      clientToken: replicaConfiguration.clientToken,
    },
    trackType,
    trackType === 'rum' ? [`application.id=${replicaConfiguration.applicationId}`] : []
  )
}

/**
 * Create a function used to build a full endpoint url from provided parameters. The goal of this
 * function is to pre-compute some parts of the URL to avoid re-computing everything on every
 * request, as only parameters are changing.
 */
function createEndpointUrlWithParametersBuilder(
  configuration: EndpointBuilderConfiguration,
  trackType: TrackType
): (parameters: string) => string {
  const path = `/api/v2/${trackType}`
  const proxy = configuration.proxy
  if (typeof proxy === 'string') {
    const normalizedProxyUrl = normalizeUrl(proxy)
    return (parameters) => `${normalizedProxyUrl}?ddforward=${encodeURIComponent(`${path}?${parameters}`)}`
  }
  if (typeof proxy === 'function') {
    return (parameters) => proxy({ path, parameters })
  }
  const host = buildEndpointHost(trackType, configuration)
  return (parameters) => `https://${host}${path}?${parameters}`
}

export function buildEndpointHost(trackType: TrackType, configuration: EndpointHostConfiguration) {
  const { site = INTAKE_SITE_US1, internalAnalyticsSubdomain } = configuration

  if (trackType === 'logs' && configuration.usePciIntake && site === INTAKE_SITE_US1) {
    return PCI_INTAKE_HOST_US1
  }

  if (internalAnalyticsSubdomain && site === INTAKE_SITE_US1) {
    return `${internalAnalyticsSubdomain}.${INTAKE_SITE_US1}`
  }

  if (site === INTAKE_SITE_FED_STAGING) {
    return `http-intake.logs.${site}`
  }

  const domainParts = site.split('.')
  const extension = domainParts.pop()
  return `browser-intake-${domainParts.join('-')}.${extension!}`
}

/**
 * Build parameters to be used for an intake request. Parameters should be re-built for each
 * request, as they change randomly.
 */
function buildEndpointParameters(
  { clientToken, internalAnalyticsSubdomain, source }: EndpointBuilderConfiguration,
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

  if (internalAnalyticsSubdomain) {
    parameters.reverse()
  }

  return parameters.join('&')
}
