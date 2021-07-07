import { BuildEnv, BuildMode } from '../boot/init'
import { includes } from '../tools/utils'
import { TransportConfiguration, InitConfiguration } from './configuration'

const ENDPOINTS = {
  alternate: {
    logs: 'logs',
    rum: 'rum',
    sessionReplay: 'session-replay',
    trace: 'trace',
  },
  classic: {
    logs: 'browser',
    rum: 'rum',
    // session-replay has no classic endpoint
    sessionReplay: undefined,
    trace: 'public-trace',
  },
}

export const Datacenter = {
  EU: 'eu',
  US: 'us',
} as const

export type Datacenter = typeof Datacenter[keyof typeof Datacenter]

export const INTAKE_SITE = {
  [Datacenter.EU]: 'datadoghq.eu',
  [Datacenter.US]: 'datadoghq.com',
}

const CLASSIC_ALLOWED_SITES = [INTAKE_SITE[Datacenter.US], INTAKE_SITE[Datacenter.EU]]

type IntakeType = keyof typeof ENDPOINTS
type EndpointType = keyof typeof ENDPOINTS[IntakeType]

interface TransportSettings {
  clientToken: string
  site: string
  buildMode: BuildMode
  sdkVersion: string
  proxyHost?: string

  service?: string
  env?: string
  version?: string
}

export function computeTransportConfiguration(initConfiguration: InitConfiguration, buildEnv: BuildEnv) {
  const transportSettings: TransportSettings = {
    buildMode: buildEnv.buildMode,
    clientToken: initConfiguration.clientToken,
    env: initConfiguration.env,
    proxyHost: initConfiguration.proxyHost,
    sdkVersion: buildEnv.sdkVersion,
    service: initConfiguration.service,
    site: initConfiguration.site || INTAKE_SITE[initConfiguration.datacenter || buildEnv.datacenter],
    version: initConfiguration.version,
  }

  const intakeType: IntakeType = getIntakeType(transportSettings.site, initConfiguration)
  const intakeUrls = getIntakeUrls(intakeType, transportSettings, initConfiguration.replica !== undefined)

  const configuration: TransportConfiguration = {
    isIntakeUrl: (url: string) => intakeUrls.some((intakeUrl) => url.indexOf(intakeUrl) === 0),
    logsEndpoint: getEndpoint(intakeType, 'logs', transportSettings),
    rumEndpoint: getEndpoint(intakeType, 'rum', transportSettings),
    sessionReplayEndpoint: getEndpoint(intakeType, 'sessionReplay', transportSettings),
    traceEndpoint: getEndpoint(intakeType, 'trace', transportSettings),
  }

  if (initConfiguration.internalMonitoringApiKey) {
    configuration.internalMonitoringEndpoint = getEndpoint(
      intakeType,
      'logs',
      transportSettings,
      'browser-agent-internal-monitoring'
    )
  }

  if (transportSettings.buildMode === BuildMode.E2E_TEST) {
    configuration.internalMonitoringEndpoint = '<<< E2E INTERNAL MONITORING ENDPOINT >>>'
    configuration.logsEndpoint = '<<< E2E LOGS ENDPOINT >>>'
    configuration.rumEndpoint = '<<< E2E RUM ENDPOINT >>>'
    configuration.sessionReplayEndpoint = '<<< E2E SESSION REPLAY ENDPOINT >>>'
  }

  if (transportSettings.buildMode === BuildMode.STAGING) {
    if (initConfiguration.replica !== undefined) {
      const replicaTransportSettings = {
        ...transportSettings,
        applicationId: initConfiguration.replica.applicationId,
        clientToken: initConfiguration.replica.clientToken,
        site: INTAKE_SITE[Datacenter.US],
      }
      configuration.replica = {
        applicationId: initConfiguration.replica.applicationId,
        internalMonitoringEndpoint: getEndpoint(
          intakeType,
          'logs',
          replicaTransportSettings,
          'browser-agent-internal-monitoring'
        ),
        logsEndpoint: getEndpoint(intakeType, 'logs', replicaTransportSettings),
        rumEndpoint: getEndpoint(intakeType, 'rum', replicaTransportSettings),
      }
    }
  }

  return configuration
}

function getIntakeType(site: string, initConfiguration: InitConfiguration) {
  return !initConfiguration.useAlternateIntakeDomains && includes(CLASSIC_ALLOWED_SITES, site) ? 'classic' : 'alternate'
}

function getIntakeUrls(intakeType: IntakeType, settings: TransportSettings, withReplica: boolean) {
  if (settings.proxyHost) {
    return [`https://${settings.proxyHost}/v1/input/`]
  }
  const sites = [settings.site]
  if (settings.buildMode === BuildMode.STAGING && withReplica) {
    sites.push(INTAKE_SITE[Datacenter.US])
  }
  const urls = []
  const endpointTypes = Object.keys(ENDPOINTS[intakeType]) as EndpointType[]
  for (const site of sites) {
    for (const endpointType of endpointTypes) {
      urls.push(`https://${getHost(intakeType, endpointType, site)}/v1/input/`)
    }
  }
  return urls
}

function getHost(intakeType: IntakeType, endpointType: EndpointType, site: string) {
  return (intakeType === 'classic' && getClassicHost(endpointType, site)) || getAlternateHost(endpointType, site)
}

function getClassicHost(endpointType: EndpointType, site: string): string | undefined {
  const endpoint = ENDPOINTS.classic[endpointType]
  return endpoint && `${endpoint}-http-intake.logs.${site}`
}

function getAlternateHost(endpointType: EndpointType, site: string): string {
  const endpoint = ENDPOINTS.alternate[endpointType]
  const domainParts = site.split('.')
  const extension = domainParts.pop()
  const suffix = `${domainParts.join('-')}.${extension!}`
  return `${endpoint}.browser-intake-${suffix}`
}

function getEndpoint(intakeType: IntakeType, endpointType: EndpointType, settings: TransportSettings, source?: string) {
  const tags =
    `sdk_version:${settings.sdkVersion}` +
    `${settings.env ? `,env:${settings.env}` : ''}` +
    `${settings.service ? `,service:${settings.service}` : ''}` +
    `${settings.version ? `,version:${settings.version}` : ''}`
  const datadogHost = getHost(intakeType, endpointType, settings.site)
  const host = settings.proxyHost ? settings.proxyHost : datadogHost
  const proxyParameter = settings.proxyHost ? `ddhost=${datadogHost}&` : ''
  const parameters = `${proxyParameter}ddsource=${source || 'browser'}&ddtags=${encodeURIComponent(tags)}`

  return `https://${host}/v1/input/${settings.clientToken}?${parameters}`
}
