import { BuildEnv } from '../../boot/init'
import { timeStampNow } from '../../tools/timeUtils'
import { normalizeUrl } from '../../tools/urlPolyfill'
import { generateUUID } from '../../tools/utils'
import { InitConfiguration } from './configuration'

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

export const INTAKE_SITE_US = 'datadoghq.com'

export type EndpointBuilder = ReturnType<typeof createEndpointBuilder>

export function createEndpointBuilder(
  initConfiguration: InitConfiguration,
  buildEnv: BuildEnv,
  endpointType: EndpointType,
  tags: string[],
  source?: string
) {
  const sdkVersion = buildEnv.sdkVersion

  const proxyUrl = initConfiguration.proxyUrl && normalizeUrl(initConfiguration.proxyUrl)
  const { site = INTAKE_SITE_US, clientToken, proxyHost } = initConfiguration

  const host = buildHost(endpointType)
  const path = buildPath(endpointType)

  function build(): string {
    const queryParameters = buildQueryParameters(endpointType, source)
    const endpoint = `https://${host}${path}?${queryParameters}`
    if (proxyUrl) {
      return `${proxyUrl}?ddforward=${encodeURIComponent(endpoint)}`
    } else if (proxyHost) {
      return `https://${proxyHost}${path}?ddhost=${host}&${queryParameters}`
    }
    return endpoint
  }

  function buildIntakeUrl(): string {
    if (proxyUrl) {
      return `${proxyUrl}?ddforward`
    }

    const endpoint = build()
    return endpoint.slice(0, endpoint.indexOf('?'))
  }

  function buildHost(endpointType: EndpointType) {
    const endpoint = ENDPOINTS[endpointType]
    const domainParts = site.split('.')
    const extension = domainParts.pop()
    const suffix = `${domainParts.join('-')}.${extension!}`
    return `${endpoint}.browser-intake-${suffix}`
  }

  function buildPath(endpointType: EndpointType) {
    return `/api/v2/${INTAKE_TRACKS[endpointType]}`
  }

  function buildQueryParameters(endpointType: EndpointType, source?: string) {
    let parameters =
      `ddsource=${source || 'browser'}` +
      `&ddtags=${encodeURIComponent([`sdk_version:${sdkVersion}`].concat(tags).join(','))}` +
      `&dd-api-key=${clientToken}` +
      `&dd-evp-origin-version=${encodeURIComponent(sdkVersion)}` +
      `&dd-evp-origin=browser` +
      `&dd-request-id=${generateUUID()}`

    if (endpointType === 'rum') {
      parameters += `&batch_time=${timeStampNow()}`
    }

    return parameters
  }

  return {
    build,
    buildIntakeUrl,
  }
}
