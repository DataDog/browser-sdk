import { BuildEnv, BuildMode, Datacenter, INTAKE_SITE, NEW_INTAKE_DOMAIN_ALLOWED_SITES } from '../boot/init'
import { CookieOptions, getCurrentSite } from '../browser/cookie'
import { getOrigin, getPathName, haveSameOrigin } from '../tools/urlPolyfill'
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

  intakeUrls: string[]

  service?: string

  isEnabled: (feature: string) => boolean

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

enum EndpointType {
  LOGS = 'logs',
  RUM = 'rum',
  TRACE = 'trace',
}

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

  const configuration: Configuration = {
    cookieOptions: buildCookieOptions(userConfiguration),
    isEnabled: (feature: string) => {
      return includes(enableExperimentalFeatures, feature)
    },
    logsEndpoint: getEndpoint(EndpointType.LOGS, transportConfiguration),
    proxyHost: userConfiguration.proxyHost,
    rumEndpoint: getEndpoint(EndpointType.RUM, transportConfiguration),
    service: userConfiguration.service,
    traceEndpoint: getEndpoint(EndpointType.TRACE, transportConfiguration),

    intakeUrls: getIntakeUrls(transportConfiguration),
    ...DEFAULT_CONFIGURATION,
  }
  if (userConfiguration.internalMonitoringApiKey) {
    configuration.internalMonitoringEndpoint = getEndpoint(
      EndpointType.LOGS,
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
          EndpointType.LOGS,
          replicaTransportConfiguration,
          'browser-agent-internal-monitoring'
        ),
        logsEndpoint: getEndpoint(EndpointType.LOGS, replicaTransportConfiguration),
        rumEndpoint: getEndpoint(EndpointType.RUM, replicaTransportConfiguration),
      }
      configuration.intakeUrls.push(...getIntakeUrls(replicaTransportConfiguration))
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

function getEndpoint(type: EndpointType, conf: TransportConfiguration, source?: string) {
  const tags =
    `sdk_version:${conf.sdkVersion}` +
    `${conf.env ? `,env:${conf.env}` : ''}` +
    `${conf.service ? `,service:${conf.service}` : ''}` +
    `${conf.version ? `,version:${conf.version}` : ''}`
  const datadogHost = getHost(type, conf)
  const host = conf.proxyHost ? conf.proxyHost : datadogHost
  const proxyParameter = conf.proxyHost ? `ddhost=${datadogHost}&` : ''
  const applicationIdParameter = conf.applicationId ? `_dd.application_id=${conf.applicationId}&` : ''
  const parameters = `${applicationIdParameter}${proxyParameter}ddsource=${source || 'browser'}&ddtags=${tags}`

  return `https://${host}/v1/input/${conf.clientToken}?${parameters}`
}

function getHost(type: EndpointType, conf: TransportConfiguration) {
  if (NEW_INTAKE_DOMAIN_ALLOWED_SITES.indexOf(conf.site) !== -1) {
    return `${type}.browser-intake-${conf.site}`
  }
  const oldTypes = {
    [EndpointType.LOGS]: 'browser',
    [EndpointType.RUM]: 'rum',
    [EndpointType.TRACE]: 'public-trace',
  }
  return `${oldTypes[type]}-http-intake.logs.${conf.site}`
}

function getIntakeUrls(conf: TransportConfiguration) {
  if (conf.proxyHost) {
    return [`https://${conf.proxyHost}/v1/input/`]
  }
  const urls = [
    `https://rum-http-intake.logs.${conf.site}/v1/input/`,
    `https://browser-http-intake.logs.${conf.site}/v1/input/`,
    `https://public-trace-http-intake.logs.${conf.site}/v1/input/`,
  ]
  if (NEW_INTAKE_DOMAIN_ALLOWED_SITES.indexOf(conf.site) !== -1) {
    urls.push(
      `https://rum.browser-intake-${conf.site}/v1/input/`,
      `https://logs.browser-intake-${conf.site}/v1/input/`,
      `https://trace.browser-intake-${conf.site}/v1/input/`
    )
  }
  return urls
}

export function isIntakeRequest(url: string, configuration: Configuration) {
  return configuration.intakeUrls.some((intakeUrl) => url.indexOf(intakeUrl) === 0)
}

function mustUseSecureCookie(userConfiguration: UserConfiguration) {
  return !!userConfiguration.useSecureSessionCookie || !!userConfiguration.useCrossSiteSessionCookie
}
