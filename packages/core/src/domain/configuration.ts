import { BuildEnv, BuildMode, Datacenter, INTAKE_SITE } from '../boot/init'
import { CookieOptions, getCurrentSite } from '../browser/cookie'
import { includes, ONE_KILO_BYTE, ONE_SECOND } from '../tools/utils'

export const DEFAULT_CONFIGURATION = {
  allowedTracingOrigins: [] as Array<string | RegExp>,
  maxErrorsByMinute: 3000,
  maxInternalMonitoringMessagesPerPage: 15,
  resourceSampleRate: 100,
  sampleRate: 100,
  silentMultipleInit: false,
  trackInteractions: false,

  /**
   * arbitrary value, byte precision not needed
   */
  requestErrorResponseLengthLimit: 32 * ONE_KILO_BYTE,

  /**
   * flush automatically, aim to be lower than ALB connection timeout
   * to maximize connection reuse.
   */
  flushTimeout: 30 * ONE_SECOND,

  /**
   * Logs intake limit
   */
  maxBatchSize: 50,
  maxMessageSize: 256 * ONE_KILO_BYTE,

  /**
   * beacon payload max queue size implementation is 64kb
   * ensure that we leave room for logs, rum and potential other users
   */
  batchBytesLimit: 16 * ONE_KILO_BYTE,
}

export interface UserConfiguration {
  publicApiKey?: string // deprecated
  clientToken: string
  applicationId?: string
  internalMonitoringApiKey?: string
  allowedTracingOrigins?: Array<string | RegExp>
  sampleRate?: number
  resourceSampleRate?: number
  datacenter?: Datacenter // deprecated
  site?: string
  enableExperimentalFeatures?: string[]
  silentMultipleInit?: boolean
  trackInteractions?: boolean
  proxyHost?: string

  service?: string
  env?: string
  version?: string

  useAlternateIntakeDomains?: boolean
  useCrossSiteSessionCookie?: boolean
  useSecureSessionCookie?: boolean
  trackSessionAcrossSubdomains?: boolean

  // only on staging build mode
  replica?: ReplicaUserConfiguration
}

interface ReplicaUserConfiguration {
  applicationId?: string
  clientToken: string
}

export type Configuration = typeof DEFAULT_CONFIGURATION & {
  cookieOptions: CookieOptions
  logsEndpoint: string
  rumEndpoint: string
  traceEndpoint: string
  internalMonitoringEndpoint?: string
  proxyHost?: string

  service?: string

  isEnabled: (feature: string) => boolean
  isIntakeUrl: (url: string) => boolean

  // only on staging build mode
  replica?: ReplicaConfiguration
}

interface ReplicaConfiguration {
  applicationId?: string
  logsEndpoint: string
  rumEndpoint: string
  internalMonitoringEndpoint: string
}

interface TransportConfiguration {
  clientToken: string
  site: string
  buildMode: BuildMode
  sdkVersion: string
  applicationId?: string
  proxyHost?: string

  service?: string
  env?: string
  version?: string
}

const ENDPOINTS = {
  alternate: {
    logs: 'logs',
    rum: 'rum',
    trace: 'trace',
  },
  classic: {
    logs: 'browser',
    rum: 'rum',
    trace: 'public-trace',
  },
}
type IntakeType = keyof typeof ENDPOINTS
type EndpointType = keyof (typeof ENDPOINTS)[IntakeType]

export function buildConfiguration(userConfiguration: UserConfiguration, buildEnv: BuildEnv): Configuration {
  const transportConfiguration: TransportConfiguration = {
    applicationId: userConfiguration.applicationId,
    buildMode: buildEnv.buildMode,
    clientToken: userConfiguration.clientToken,
    env: userConfiguration.env,
    proxyHost: userConfiguration.proxyHost,
    sdkVersion: buildEnv.sdkVersion,
    service: userConfiguration.service,
    site: userConfiguration.site || INTAKE_SITE[userConfiguration.datacenter || buildEnv.datacenter],
    version: userConfiguration.version,
  }

  const enableExperimentalFeatures = Array.isArray(userConfiguration.enableExperimentalFeatures)
    ? userConfiguration.enableExperimentalFeatures
    : []

  const intakeType: IntakeType = userConfiguration.useAlternateIntakeDomains ? 'alternate' : 'classic'
  const intakeUrls = getIntakeUrls(intakeType, transportConfiguration, userConfiguration.replica !== undefined)
  const configuration: Configuration = {
    cookieOptions: buildCookieOptions(userConfiguration),
    isEnabled: (feature: string) => {
      return includes(enableExperimentalFeatures, feature)
    },
    logsEndpoint: getEndpoint(intakeType, 'logs', transportConfiguration),
    proxyHost: userConfiguration.proxyHost,
    rumEndpoint: getEndpoint(intakeType, 'rum', transportConfiguration),
    service: userConfiguration.service,
    traceEndpoint: getEndpoint(intakeType, 'trace', transportConfiguration),

    isIntakeUrl: (url) => intakeUrls.some((intakeUrl) => url.indexOf(intakeUrl) === 0),
    ...DEFAULT_CONFIGURATION,
  }
  if (userConfiguration.internalMonitoringApiKey) {
    configuration.internalMonitoringEndpoint = getEndpoint(
      intakeType,
      'logs',
      transportConfiguration,
      'browser-agent-internal-monitoring'
    )
  }

  if ('allowedTracingOrigins' in userConfiguration) {
    configuration.allowedTracingOrigins = userConfiguration.allowedTracingOrigins!
  }

  if ('sampleRate' in userConfiguration) {
    configuration.sampleRate = userConfiguration.sampleRate!
  }

  if ('resourceSampleRate' in userConfiguration) {
    configuration.resourceSampleRate = userConfiguration.resourceSampleRate!
  }

  if ('trackInteractions' in userConfiguration) {
    configuration.trackInteractions = !!userConfiguration.trackInteractions
  }

  if (transportConfiguration.buildMode === BuildMode.E2E_TEST) {
    configuration.internalMonitoringEndpoint = '<<< E2E INTERNAL MONITORING ENDPOINT >>>'
    configuration.logsEndpoint = '<<< E2E LOGS ENDPOINT >>>'
    configuration.rumEndpoint = '<<< E2E RUM ENDPOINT >>>'
  }

  if (transportConfiguration.buildMode === BuildMode.STAGING) {
    if (userConfiguration.replica !== undefined) {
      const replicaTransportConfiguration: TransportConfiguration = {
        ...transportConfiguration,
        applicationId: userConfiguration.replica.applicationId,
        clientToken: userConfiguration.replica.clientToken,
        site: INTAKE_SITE[Datacenter.US],
      }
      configuration.replica = {
        applicationId: userConfiguration.replica.applicationId,
        internalMonitoringEndpoint: getEndpoint(
          intakeType,
          'logs',
          replicaTransportConfiguration,
          'browser-agent-internal-monitoring'
        ),
        logsEndpoint: getEndpoint(intakeType, 'logs', replicaTransportConfiguration),
        rumEndpoint: getEndpoint(intakeType, 'rum', replicaTransportConfiguration),
      }
    }
  }

  return configuration
}

export function buildCookieOptions(userConfiguration: UserConfiguration) {
  const cookieOptions: CookieOptions = {}

  cookieOptions.secure = mustUseSecureCookie(userConfiguration)
  cookieOptions.crossSite = !!userConfiguration.useCrossSiteSessionCookie

  if (!!userConfiguration.trackSessionAcrossSubdomains) {
    cookieOptions.domain = getCurrentSite()
  }

  return cookieOptions
}

function getEndpoint(
  intakeType: IntakeType,
  endpointType: EndpointType,
  conf: TransportConfiguration,
  source?: string
) {
  const tags =
    `sdk_version:${conf.sdkVersion}` +
    `${conf.env ? `,env:${conf.env}` : ''}` +
    `${conf.service ? `,service:${conf.service}` : ''}` +
    `${conf.version ? `,version:${conf.version}` : ''}`
  const datadogHost = getHost(intakeType, endpointType, conf.site)
  const host = conf.proxyHost ? conf.proxyHost : datadogHost
  const proxyParameter = conf.proxyHost ? `ddhost=${datadogHost}&` : ''
  const applicationIdParameter = conf.applicationId ? `_dd.application_id=${conf.applicationId}&` : ''
  const parameters = `${applicationIdParameter}${proxyParameter}ddsource=${source || 'browser'}&ddtags=${tags}`

  return `https://${host}/v1/input/${conf.clientToken}?${parameters}`
}

function getHost(intakeType: IntakeType, endpointType: EndpointType, site: string) {
  const endpoint = ENDPOINTS[intakeType][endpointType]
  if (intakeType === 'classic') {
    return `${endpoint}-http-intake.logs.${site}`
  }
  const domainParts = site.split('.')
  const extension = domainParts.pop()
  const suffix = `${domainParts.join('-')}.${extension}`
  return `${endpoint}.browser-intake-${suffix}`
}

function getIntakeUrls(intakeType: IntakeType, conf: TransportConfiguration, withReplica: boolean) {
  if (conf.proxyHost) {
    return [`https://${conf.proxyHost}/v1/input/`]
  }
  const sites = [conf.site]
  if (conf.buildMode === BuildMode.STAGING && withReplica) {
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

function mustUseSecureCookie(userConfiguration: UserConfiguration) {
  return !!userConfiguration.useSecureSessionCookie || !!userConfiguration.useCrossSiteSessionCookie
}
