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

  const host = buildEndpointHost(initConfiguration, endpointType)
  const baseUrl = `https://${host}/api/v2/${INTAKE_TRACKS[endpointType]}`
  const proxyUrl = initConfiguration.proxyUrl && normalizeUrl(initConfiguration.proxyUrl)

  return {
    build(api: 'xhr' | 'fetch' | 'beacon', retry?: RetryInfo) {
      const tags = [`sdk_version:${__BUILD_ENV__SDK_VERSION__}`, `api:${api}`].concat(configurationTags)
      if (retry) {
        tags.push(`retry_count:${retry.count}`, `retry_after:${retry.lastFailureStatus}`)
      }
      let parameters =
        'ddsource=browser' +
        `&ddtags=${encodeURIComponent(tags.join(','))}` +
        `&dd-api-key=${clientToken}` +
        `&dd-evp-origin-version=${encodeURIComponent(__BUILD_ENV__SDK_VERSION__)}` +
        '&dd-evp-origin=browser' +
        `&dd-request-id=${generateUUID()}`

      if (endpointType === 'rum') {
        parameters += `&batch_time=${timeStampNow()}`
      }
      const endpointUrl = `${baseUrl}?${parameters}`

      return proxyUrl ? `${proxyUrl}?ddforward=${encodeURIComponent(endpointUrl)}` : endpointUrl
    },
    buildIntakeUrl() {
      return proxyUrl ? `${proxyUrl}?ddforward` : baseUrl
    },
    endpointType,
  }
}

function buildEndpointHost(initConfiguration: InitConfiguration, endpointType: EndpointType) {
  const { site = INTAKE_SITE_US1, internalAnalyticsSubdomain } = initConfiguration

  if (internalAnalyticsSubdomain && site === INTAKE_SITE_US1) {
    return `${internalAnalyticsSubdomain}.${INTAKE_SITE_US1}`
  }

  const domainParts = site.split('.')
  const extension = domainParts.pop()
  return `${ENDPOINTS[endpointType]}.browser-intake-${domainParts.join('-')}.${extension!}`
}
