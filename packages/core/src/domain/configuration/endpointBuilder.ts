import { timeStampNow } from '../../tools/timeUtils'
import { normalizeUrl } from '../../tools/urlPolyfill'
import { generateUUID } from '../../tools/utils'
import type { InitConfiguration } from './configuration'

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

type EndpointType = keyof typeof ENDPOINTS

export const INTAKE_SITE_STAGING = 'datad0g.com'
export const INTAKE_SITE_US = 'datadoghq.com'
export const INTAKE_SITE_US3 = 'us3.datadoghq.com'
export const INTAKE_SITE_US5 = 'us5.datadoghq.com'
export const INTAKE_SITE_EU = 'datadoghq.eu'

export type EndpointBuilder = ReturnType<typeof createEndpointBuilder>

export function createEndpointBuilder(
  initConfiguration: InitConfiguration,
  endpointType: EndpointType,
  tags: string[],
  source?: string
) {
  const { site = INTAKE_SITE_US, clientToken } = initConfiguration

  const domainParts = site.split('.')
  const extension = domainParts.pop()
  const host = `${ENDPOINTS[endpointType]}.browser-intake-${domainParts.join('-')}.${extension!}`
  const baseUrl = `https://${host}/api/v2/${INTAKE_TRACKS[endpointType]}`
  const proxyUrl = initConfiguration.proxyUrl && normalizeUrl(initConfiguration.proxyUrl)

  return {
    build() {
      let parameters =
        `ddsource=${source || 'browser'}` +
        `&ddtags=${encodeURIComponent([`sdk_version:${__BUILD_ENV__SDK_VERSION__}`].concat(tags).join(','))}` +
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
