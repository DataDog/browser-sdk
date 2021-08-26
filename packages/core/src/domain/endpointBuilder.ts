import { BuildEnv } from '../boot/init'
import { generateUUID, includes } from '../tools/utils'
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

export const ENDPOINTS_TYPES = Object.keys(ENDPOINTS['alternate']) as EndpointType[]
export type EndpointType = keyof typeof ENDPOINTS[IntakeType]

export const INTAKE_SITE_US = 'datadoghq.com'
const INTAKE_SITE_US3 = 'us3.datadoghq.com'
const INTAKE_SITE_GOV = 'ddog-gov.com'
const INTAKE_SITE_EU = 'datadoghq.eu'

const CLASSIC_ALLOWED_SITES = [INTAKE_SITE_US, INTAKE_SITE_EU]
const INTAKE_V1_ALLOWED_SITES = [INTAKE_SITE_US, INTAKE_SITE_US3, INTAKE_SITE_EU, INTAKE_SITE_GOV]

type IntakeType = keyof typeof ENDPOINTS

type IntakeApiVersion = 1 | 2

export class EndpointBuilder {
  private site: string
  private clientToken: string
  private env: string | undefined
  private proxyHost: string | undefined
  private sdkVersion: string
  private service: string | undefined
  private version: string | undefined
  private intakeApiVersion: IntakeApiVersion
  private useAlternateIntakeDomains: boolean
  private isIntakeV2Enabled: boolean

  constructor(initConfiguration: InitConfiguration, buildEnv: BuildEnv, isIntakeV2Enabled?: boolean) {
    this.isIntakeV2Enabled = !!isIntakeV2Enabled
    this.site = initConfiguration.site || INTAKE_SITE_US
    this.clientToken = initConfiguration.clientToken
    this.env = initConfiguration.env
    this.proxyHost = initConfiguration.proxyHost
    this.sdkVersion = buildEnv.sdkVersion
    this.service = initConfiguration.service
    this.version = initConfiguration.version
    this.intakeApiVersion = initConfiguration.intakeApiVersion || 1
    this.useAlternateIntakeDomains = !!initConfiguration.useAlternateIntakeDomains
  }

  build(endpointType: EndpointType, source?: string) {
    const tags =
      `sdk_version:${this.sdkVersion}` +
      `${this.env ? `,env:${this.env}` : ''}` +
      `${this.service ? `,service:${this.service}` : ''}` +
      `${this.version ? `,version:${this.version}` : ''}`
    const datadogHost = this.buildHost(endpointType)
    const proxyParameter = this.proxyHost ? `ddhost=${datadogHost}&` : ''
    let parameters = `${proxyParameter}ddsource=${source || 'browser'}&ddtags=${encodeURIComponent(tags)}`

    if (this.shouldUseIntakeV2(endpointType)) {
      parameters +=
        `&dd-api-key=${this.clientToken}&` +
        `dd-evp-origin-version=${this.sdkVersion}&` +
        `dd-evp-origin=browser&` +
        `dd-request-id=${generateUUID()}`
    }

    return `${this.buildIntakeUrl(endpointType)}?${parameters}`
  }

  buildIntakeUrl(endpointType: EndpointType): string {
    const datadogHost = this.buildHost(endpointType)
    const host = this.proxyHost ? this.proxyHost : datadogHost
    return `https://${host}${this.buildPath(endpointType)}`
  }

  private buildHost(endpointType: EndpointType) {
    if (this.shouldUseAlternateDomain(endpointType)) {
      const endpoint = ENDPOINTS.alternate[endpointType]
      const domainParts = this.site.split('.')
      const extension = domainParts.pop()
      const suffix = `${domainParts.join('-')}.${extension!}`
      return `${endpoint}.browser-intake-${suffix}`
    }
    const endpoint = ENDPOINTS.classic[endpointType]!
    return `${endpoint}-http-intake.logs.${this.site}`
  }

  private buildPath(endpointType: EndpointType) {
    return this.shouldUseIntakeV2(endpointType)
      ? `/api/v2/${INTAKE_TRACKS[endpointType]}`
      : `/v1/input/${this.clientToken}`
  }

  private shouldUseIntakeV2(endpointType?: EndpointType): boolean {
    return (
      this.isIntakeV2Enabled &&
      (this.intakeApiVersion === 2 || !includes(INTAKE_V1_ALLOWED_SITES, this.site) || endpointType === 'sessionReplay')
    )
  }

  private shouldUseAlternateDomain(endpointType?: EndpointType): boolean {
    return (
      this.useAlternateIntakeDomains || !includes(CLASSIC_ALLOWED_SITES, this.site) || endpointType === 'sessionReplay'
    )
  }
}
