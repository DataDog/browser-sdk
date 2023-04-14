import type { RetryInfo, FlushReason } from '../../transport'
import { timeStampNow } from '../../tools/utils/timeUtils'
import { normalizeUrl } from '../../tools/utils/urlPolyfill'
import { ExperimentalFeature, isExperimentalFeatureEnabled } from '../../tools/experimentalFeatures'
import { generateUUID } from '../../tools/utils/stringUtils'
import type { InitConfiguration } from './configuration'
import { INTAKE_SITE_AP1, INTAKE_SITE_US1 } from './intakeSites'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

export const ENDPOINTS = {
  logs: 'logs',
  rum: 'rum',
  sessionReplay: 'session-replay',
} as const

const INTAKE_TRACKS = {
  logs: 'logs',
  rum: 'rum',
  sessionReplay: 'replay',
}

export type EndpointType = keyof typeof ENDPOINTS

export type EndpointBuilder = ReturnType<typeof createEndpointBuilder>

export function createEndpointBuilder(
  initConfiguration: InitConfiguration,
  endpointType: EndpointType,
  configurationTags: string[]
) {
  const buildUrlWithParameters = createEndpointUrlWithParametersBuilder(initConfiguration, endpointType)

  return {
    build(api: 'xhr' | 'fetch' | 'beacon', flushReason?: FlushReason, retry?: RetryInfo) {
      const parameters = buildEndpointParameters(
        initConfiguration,
        endpointType,
        configurationTags,
        api,
        flushReason,
        retry
      )
      return buildUrlWithParameters(parameters)
    },
    urlPrefix: buildUrlWithParameters(''),
    endpointType,
  }
}

/**
 * Create a function used to build a full endpoint url from provided parameters. The goal of this
 * function is to pre-compute some parts of the URL to avoid re-computing everything on every
 * request, as only parameters are changing.
 */
function createEndpointUrlWithParametersBuilder(
  initConfiguration: InitConfiguration,
  endpointType: EndpointType
): (parameters: string) => string {
  const path = `/api/v2/${INTAKE_TRACKS[endpointType]}`

  const { proxy, proxyUrl } = initConfiguration
  if (proxy) {
    const normalizedProxyUrl = normalizeUrl(proxy)
    return (parameters) => `${normalizedProxyUrl}?ddforward=${encodeURIComponent(`${path}?${parameters}`)}`
  }

  const host = buildEndpointHost(initConfiguration, endpointType)

  if (proxy === undefined && proxyUrl) {
    // TODO: remove this in a future major.
    const normalizedProxyUrl = normalizeUrl(proxyUrl)
    return (parameters) =>
      `${normalizedProxyUrl}?ddforward=${encodeURIComponent(`https://${host}${path}?${parameters}`)}`
  }

  return (parameters) => `https://${host}${path}?${parameters}`
}

function buildEndpointHost(initConfiguration: InitConfiguration, endpointType: EndpointType) {
  const { site = INTAKE_SITE_US1, internalAnalyticsSubdomain } = initConfiguration

  if (internalAnalyticsSubdomain && site === INTAKE_SITE_US1) {
    return `${internalAnalyticsSubdomain}.${INTAKE_SITE_US1}`
  }

  const domainParts = site.split('.')
  const extension = domainParts.pop()
  const subdomain = site !== INTAKE_SITE_AP1 ? `${ENDPOINTS[endpointType]}.` : ''
  return `${subdomain}browser-intake-${domainParts.join('-')}.${extension!}`
}

/**
 * Build parameters to be used for an intake request. Parameters should be re-built for each
 * request, as they change randomly.
 */
function buildEndpointParameters(
  { clientToken, internalAnalyticsSubdomain }: InitConfiguration,
  endpointType: EndpointType,
  configurationTags: string[],
  api: 'xhr' | 'fetch' | 'beacon',
  flushReason: FlushReason | undefined,
  retry: RetryInfo | undefined
) {
  const tags = [`sdk_version:${__BUILD_ENV__SDK_VERSION__}`, `api:${api}`].concat(configurationTags)
  if (flushReason && isExperimentalFeatureEnabled(ExperimentalFeature.COLLECT_FLUSH_REASON)) {
    tags.push(`flush_reason:${flushReason}`)
  }
  if (retry) {
    tags.push(`retry_count:${retry.count}`, `retry_after:${retry.lastFailureStatus}`)
  }
  const parameters = [
    'ddsource=browser',
    `ddtags=${encodeURIComponent(tags.join(','))}`,
    `dd-api-key=${clientToken}`,
    `dd-evp-origin-version=${encodeURIComponent(__BUILD_ENV__SDK_VERSION__)}`,
    'dd-evp-origin=browser',
    `dd-request-id=${generateUUID()}`,
  ]

  if (endpointType === 'rum') {
    parameters.push(`batch_time=${timeStampNow()}`)
  }
  if (internalAnalyticsSubdomain) {
    parameters.reverse()
  }

  return parameters.join('&')
}
