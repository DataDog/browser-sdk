import type { RetryInfo } from '../../transport'
import { timeStampNow } from '../../tools/timeUtils'
import { normalizeUrl } from '../../tools/urlPolyfill'
import { generateUUID } from '../../tools/utils'
import type { InitConfiguration } from './configuration'
import { INTAKE_SITE_US1 } from './intakeSites'

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
  const { clientToken } = initConfiguration

  const baseUrl = buildEndpointBaseUrl(initConfiguration, endpointType)
  const proxyUrl = buildProxyUrl(initConfiguration)

  return {
    build(api: 'xhr' | 'fetch' | 'beacon', retry?: RetryInfo) {
      const tags = [`sdk_version:${__BUILD_ENV__SDK_VERSION__}`, `api:${api}`].concat(configurationTags)
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
      if (initConfiguration.internalAnalyticsSubdomain) {
        parameters.reverse()
      }
      const endpointUrl = `${baseUrl}?${parameters.join('&')}`

      return proxyUrl ? `${proxyUrl}?ddforward=${encodeURIComponent(endpointUrl)}` : endpointUrl
    },
    buildIntakeUrl() {
      return proxyUrl ? `${proxyUrl}?ddforward` : baseUrl
    },
    endpointType,
  }
}

function buildProxyUrl({ proxy, proxyUrl }: InitConfiguration) {
  const rawProxyUrl = proxy ?? proxyUrl
  return rawProxyUrl && normalizeUrl(rawProxyUrl)
}

function buildEndpointBaseUrl(
  { site = INTAKE_SITE_US1, internalAnalyticsSubdomain, proxy }: InitConfiguration,
  endpointType: EndpointType
) {
  const path = `/api/v2/${INTAKE_TRACKS[endpointType]}`

  if (proxy) {
    return path
  }

  let host: string
  if (internalAnalyticsSubdomain && site === INTAKE_SITE_US1) {
    host = `${internalAnalyticsSubdomain}.${INTAKE_SITE_US1}`
  } else {
    const domainParts = site.split('.')
    const extension = domainParts.pop()
    host = `${ENDPOINTS[endpointType]}.browser-intake-${domainParts.join('-')}.${extension!}`
  }

  return `https://${host}${path}`
}
