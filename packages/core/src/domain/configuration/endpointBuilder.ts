import { BuildEnv } from '../../boot/init'
import { timeStampNow } from '../../tools/timeUtils'
import { normalizeUrl } from '../../tools/urlPolyfill'
import { generateUUID, includes } from '../../tools/utils'
import { InitConfiguration } from './configuration'

export const ENDPOINTS = {
  alternate: {
    logs: 'logs',
    rum: 'rum',
    sessionReplay: 'session-replay',
  },
  classic: {
    logs: 'browser',
    rum: 'rum',
    // session-replay has no classic endpoint
    sessionReplay: undefined,
  },
}

const INTAKE_TRACKS = {
  logs: 'logs',
  rum: 'rum',
  sessionReplay: 'replay',
}

export type EndpointType = keyof typeof ENDPOINTS[IntakeType]

export const INTAKE_SITE_US = 'datadoghq.com'
const INTAKE_SITE_US3 = 'us3.datadoghq.com'
const INTAKE_SITE_GOV = 'ddog-gov.com'
const INTAKE_SITE_EU = 'datadoghq.eu'

const CLASSIC_ALLOWED_SITES = [INTAKE_SITE_US, INTAKE_SITE_EU]
const INTAKE_V1_ALLOWED_SITES = [INTAKE_SITE_US, INTAKE_SITE_US3, INTAKE_SITE_EU, INTAKE_SITE_GOV]

type IntakeType = keyof typeof ENDPOINTS
export type EndpointBuilder = ReturnType<typeof createEndpointBuilder>

export function createEndpointBuilder(
  initConfiguration: InitConfiguration,
  buildEnv: BuildEnv,
  endpointType: EndpointType,
  source?: string
) {
  const sdkVersion = buildEnv.sdkVersion
  const proxyUrl = initConfiguration.proxyUrl && normalizeUrl(initConfiguration.proxyUrl)
  const {
    site = INTAKE_SITE_US,
    clientToken,
    env,
    proxyHost,
    service,
    version,
    intakeApiVersion,
    useAlternateIntakeDomains,
  } = initConfiguration

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
    if (shouldUseAlternateDomain(endpointType)) {
      const endpoint = ENDPOINTS.alternate[endpointType]
      const domainParts = site.split('.')
      const extension = domainParts.pop()
      const suffix = `${domainParts.join('-')}.${extension!}`
      return `${endpoint}.browser-intake-${suffix}`
    }
    const endpoint = ENDPOINTS.classic[endpointType]!
    return `${endpoint}-http-intake.logs.${site}`
  }

  function buildPath(endpointType: EndpointType) {
    return shouldUseIntakeV2(endpointType) ? `/api/v2/${INTAKE_TRACKS[endpointType]}` : `/v1/input/${clientToken}`
  }

  function buildQueryParameters(endpointType: EndpointType, source?: string) {
    const tags =
      `sdk_version:${sdkVersion}` +
      `${env ? `,env:${env}` : ''}` +
      `${service ? `,service:${service}` : ''}` +
      `${version ? `,version:${version}` : ''}`

    let parameters = `ddsource=${source || 'browser'}&ddtags=${encodeURIComponent(tags)}`

    if (shouldUseIntakeV2(endpointType)) {
      parameters +=
        `&dd-api-key=${clientToken}` +
        `&dd-evp-origin-version=${encodeURIComponent(sdkVersion)}` +
        `&dd-evp-origin=browser` +
        `&dd-request-id=${generateUUID()}`
    }

    if (endpointType === 'rum') {
      parameters += `&batch_time=${timeStampNow()}`
    }

    return parameters
  }

  function shouldUseIntakeV2(endpointType?: EndpointType): boolean {
    return intakeApiVersion === 2 || !includes(INTAKE_V1_ALLOWED_SITES, site) || endpointType === 'sessionReplay'
  }

  function shouldUseAlternateDomain(endpointType?: EndpointType): boolean {
    return useAlternateIntakeDomains || !includes(CLASSIC_ALLOWED_SITES, site) || endpointType === 'sessionReplay'
  }

  return {
    build,
    buildIntakeUrl,
  }
}
