import { BuildEnv } from '../boot/init'
import { CookieOptions, getCurrentSite } from '../browser/cookie'
import { catchUserErrors } from '../tools/catchUserErrors'
import { includes, ONE_KILO_BYTE, ONE_SECOND } from '../tools/utils'
import { computeTransportConfiguration, Datacenter } from './transportConfiguration'

export const DEFAULT_CONFIGURATION = {
  allowedTracingOrigins: [] as Array<string | RegExp>,
  maxErrorsByMinute: 3000,
  maxInternalMonitoringMessagesPerPage: 15,
  resourceSampleRate: 100,
  sampleRate: 100,
  silentMultipleInit: false,
  trackInteractions: false,
  trackViewsManually: false,

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
  resourceSampleRate?: number // deprecated
  datacenter?: Datacenter // deprecated
  site?: string
  enableExperimentalFeatures?: string[]
  silentMultipleInit?: boolean
  trackInteractions?: boolean
  trackViewsManually?: boolean
  proxyHost?: string
  beforeSend?: BeforeSendCallback

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

export type BeforeSendCallback = (event: any, context?: any) => unknown

interface ReplicaUserConfiguration {
  applicationId?: string
  clientToken: string
}

export type Configuration = typeof DEFAULT_CONFIGURATION &
  TransportConfiguration & {
    cookieOptions: CookieOptions

    service?: string
    beforeSend?: BeforeSendCallback

    isEnabled: (feature: string) => boolean
  }

export interface TransportConfiguration {
  logsEndpoint: string
  rumEndpoint: string
  traceEndpoint: string
  sessionReplayEndpoint: string
  internalMonitoringEndpoint?: string
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

export function buildConfiguration(userConfiguration: UserConfiguration, buildEnv: BuildEnv): Configuration {
  const enableExperimentalFeatures = Array.isArray(userConfiguration.enableExperimentalFeatures)
    ? userConfiguration.enableExperimentalFeatures
    : []

  const configuration: Configuration = {
    beforeSend:
      userConfiguration.beforeSend && catchUserErrors(userConfiguration.beforeSend, 'beforeSend threw an error:'),
    cookieOptions: buildCookieOptions(userConfiguration),
    isEnabled: (feature: string) => includes(enableExperimentalFeatures, feature),
    service: userConfiguration.service,
    ...computeTransportConfiguration(userConfiguration, buildEnv),
    ...DEFAULT_CONFIGURATION,
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

  if ('trackViewsManually' in userConfiguration) {
    configuration.trackViewsManually = !!userConfiguration.trackViewsManually
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

function mustUseSecureCookie(userConfiguration: UserConfiguration) {
  return !!userConfiguration.useSecureSessionCookie || !!userConfiguration.useCrossSiteSessionCookie
}
