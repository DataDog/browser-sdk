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

export interface InitConfiguration {
  publicApiKey?: string // deprecated
  clientToken: string
  applicationId?: string
  actionNameAttribute?: string
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

/**
 * TODO: Remove this type in the next major release
 * @deprecated Use InitConfiguration instead
 */
export type UserConfiguration = InitConfiguration

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

    actionNameAttribute?: string

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

export function buildConfiguration(initConfiguration: InitConfiguration, buildEnv: BuildEnv): Configuration {
  const enableExperimentalFeatures = Array.isArray(initConfiguration.enableExperimentalFeatures)
    ? initConfiguration.enableExperimentalFeatures
    : []

  const configuration: Configuration = {
    beforeSend:
      initConfiguration.beforeSend && catchUserErrors(initConfiguration.beforeSend, 'beforeSend threw an error:'),
    cookieOptions: buildCookieOptions(initConfiguration),
    isEnabled: (feature: string) => includes(enableExperimentalFeatures, feature),
    service: initConfiguration.service,
    ...computeTransportConfiguration(initConfiguration, buildEnv),
    ...DEFAULT_CONFIGURATION,
  }

  if ('allowedTracingOrigins' in initConfiguration) {
    configuration.allowedTracingOrigins = initConfiguration.allowedTracingOrigins!
  }

  if ('sampleRate' in initConfiguration) {
    configuration.sampleRate = initConfiguration.sampleRate!
  }

  if ('resourceSampleRate' in initConfiguration) {
    configuration.resourceSampleRate = initConfiguration.resourceSampleRate!
  }

  if ('trackInteractions' in initConfiguration) {
    configuration.trackInteractions = !!initConfiguration.trackInteractions
  }

  if ('trackViewsManually' in initConfiguration) {
    configuration.trackViewsManually = !!initConfiguration.trackViewsManually
  }

  if ('actionNameAttribute' in initConfiguration) {
    configuration.actionNameAttribute = initConfiguration.actionNameAttribute
  }

  return configuration
}

export function buildCookieOptions(initConfiguration: InitConfiguration) {
  const cookieOptions: CookieOptions = {}

  cookieOptions.secure = mustUseSecureCookie(initConfiguration)
  cookieOptions.crossSite = !!initConfiguration.useCrossSiteSessionCookie

  if (!!initConfiguration.trackSessionAcrossSubdomains) {
    cookieOptions.domain = getCurrentSite()
  }

  return cookieOptions
}

function mustUseSecureCookie(initConfiguration: InitConfiguration) {
  return !!initConfiguration.useSecureSessionCookie || !!initConfiguration.useCrossSiteSessionCookie
}
