import { CookieOptions, getCurrentSite } from './cookie'
import { BuildEnv, BuildMode, Datacenter, INTAKE_SITE } from './init'
import { haveSameOrigin } from './urlPolyfill'
import { includes, ONE_KILO_BYTE, ONE_SECOND } from './utils'

export const DEFAULT_CONFIGURATION = {
  allowedTracingOrigins: [] as Array<string | RegExp>,
  isCollectingError: true,
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
  isCollectingError?: boolean
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

  // only on e2e-test build mode
  internalMonitoringEndpoint?: string
  logsEndpoint?: string
  rumEndpoint?: string
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
    cookieOptions: {},
    isEnabled: (feature: string) => {
      return includes(enableExperimentalFeatures, feature)
    },
    logsEndpoint: getEndpoint('browser', transportConfiguration),
    proxyHost: userConfiguration.proxyHost,
    rumEndpoint: getEndpoint('rum', transportConfiguration),
    traceEndpoint: getEndpoint('public-trace', transportConfiguration),
    ...DEFAULT_CONFIGURATION,
  }
  if (userConfiguration.internalMonitoringApiKey) {
    configuration.internalMonitoringEndpoint = getEndpoint(
      'browser',
      transportConfiguration,
      'browser-agent-internal-monitoring'
    )
  }

  if ('allowedTracingOrigins' in userConfiguration) {
    configuration.allowedTracingOrigins = userConfiguration.allowedTracingOrigins!
  }

  if ('isCollectingError' in userConfiguration) {
    configuration.isCollectingError = !!userConfiguration.isCollectingError
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

  configuration.cookieOptions.secure = mustUseSecureCookie(userConfiguration)
  configuration.cookieOptions.crossSite = !!userConfiguration.useCrossSiteSessionCookie

  if (!!userConfiguration.trackSessionAcrossSubdomains) {
    configuration.cookieOptions.domain = getCurrentSite()
  }

  if (transportConfiguration.buildMode === BuildMode.E2E_TEST) {
    if (userConfiguration.internalMonitoringEndpoint !== undefined) {
      configuration.internalMonitoringEndpoint = userConfiguration.internalMonitoringEndpoint
    }
    if (userConfiguration.logsEndpoint !== undefined) {
      configuration.logsEndpoint = userConfiguration.logsEndpoint
    }
    if (userConfiguration.rumEndpoint !== undefined) {
      configuration.rumEndpoint = userConfiguration.rumEndpoint
    }
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
          'browser',
          replicaTransportConfiguration,
          'browser-agent-internal-monitoring'
        ),
        logsEndpoint: getEndpoint('browser', replicaTransportConfiguration),
        rumEndpoint: getEndpoint('rum', replicaTransportConfiguration),
      }
    }
  }

  return configuration
}

function getEndpoint(type: string, conf: TransportConfiguration, source?: string) {
  const tags =
    `sdk_version:${conf.sdkVersion}` +
    `${conf.env ? `,env:${conf.env}` : ''}` +
    `${conf.service ? `,service:${conf.service}` : ''}` +
    `${conf.version ? `,version:${conf.version}` : ''}`
  const datadogHost = `${type}-http-intake.logs.${conf.site}`
  const host = conf.proxyHost ? conf.proxyHost : datadogHost
  const proxyParameter = conf.proxyHost ? `ddhost=${datadogHost}&` : ''
  const applicationIdParameter = conf.applicationId ? `_dd.application_id=${conf.applicationId}&` : ''
  const parameters = `${applicationIdParameter}${proxyParameter}ddsource=${source || 'browser'}&ddtags=${tags}`

  return `https://${host}/v1/input/${conf.clientToken}?${parameters}`
}

export function isIntakeRequest(url: string, configuration: Configuration) {
  return (
    haveSameOrigin(url, configuration.logsEndpoint) ||
    haveSameOrigin(url, configuration.rumEndpoint) ||
    haveSameOrigin(url, configuration.traceEndpoint) ||
    (!!configuration.internalMonitoringEndpoint && haveSameOrigin(url, configuration.internalMonitoringEndpoint)) ||
    (!!configuration.replica &&
      (haveSameOrigin(url, configuration.replica.logsEndpoint) ||
        haveSameOrigin(url, configuration.replica.rumEndpoint) ||
        haveSameOrigin(url, configuration.replica.internalMonitoringEndpoint)))
  )
}

export function mustUseSecureCookie(userConfiguration: UserConfiguration) {
  return !!userConfiguration.useSecureSessionCookie || !!userConfiguration.useCrossSiteSessionCookie
}
