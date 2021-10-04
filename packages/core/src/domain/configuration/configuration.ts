import { BuildEnv } from '../../boot/init'
import { CookieOptions, getCurrentSite } from '../../browser/cookie'
import { catchUserErrors } from '../../tools/catchUserErrors'
import { objectHasValue, ONE_KILO_BYTE, ONE_SECOND } from '../../tools/utils'
import { computeTransportConfiguration, TransportConfiguration } from './transportConfiguration'

export const DefaultPrivacyLevel = {
  ALLOW: 'allow',
  MASK: 'mask',
  MASK_USER_INPUT: 'mask-user-input',
} as const
export type DefaultPrivacyLevel = typeof DefaultPrivacyLevel[keyof typeof DefaultPrivacyLevel]

export const DEFAULT_CONFIGURATION = {
  allowedTracingOrigins: [] as Array<string | RegExp>,
  maxErrorsPerMinute: 3000,
  maxActionsPerMinute: 3000,
  maxInternalMonitoringMessagesPerPage: 15,
  sampleRate: 100,
  replaySampleRate: 100,
  silentMultipleInit: false,
  trackInteractions: false,
  trackViewsManually: false,
  defaultPrivacyLevel: DefaultPrivacyLevel.MASK_USER_INPUT as DefaultPrivacyLevel,

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
  clientToken: string
  applicationId?: string | undefined
  actionNameAttribute?: string | undefined
  internalMonitoringApiKey?: string | undefined
  allowedTracingOrigins?: Array<string | RegExp> | undefined
  sampleRate?: number | undefined
  replaySampleRate?: number | undefined
  site?: string | undefined
  enableExperimentalFeatures?: string[] | undefined
  silentMultipleInit?: boolean | undefined
  trackInteractions?: boolean | undefined
  trackViewsManually?: boolean | undefined

  /**
   * @deprecated Favor proxyUrl option
   */
  proxyHost?: string | undefined
  proxyUrl?: string | undefined
  beforeSend?: BeforeSendCallback | undefined
  defaultPrivacyLevel?: DefaultPrivacyLevel | undefined

  service?: string | undefined
  env?: string | undefined
  version?: string | undefined

  useAlternateIntakeDomains?: boolean | undefined
  intakeApiVersion?: 1 | 2 | undefined

  useCrossSiteSessionCookie?: boolean | undefined
  useSecureSessionCookie?: boolean | undefined
  trackSessionAcrossSubdomains?: boolean | undefined

  // only on staging build mode
  replica?: ReplicaUserConfiguration | undefined
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

    actionNameAttribute?: string
  }

export function buildConfiguration(initConfiguration: InitConfiguration, buildEnv: BuildEnv): Configuration {
  const configuration: Configuration = {
    beforeSend:
      initConfiguration.beforeSend && catchUserErrors(initConfiguration.beforeSend, 'beforeSend threw an error:'),
    cookieOptions: buildCookieOptions(initConfiguration),
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

  if ('replaySampleRate' in initConfiguration) {
    configuration.replaySampleRate = initConfiguration.replaySampleRate!
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

  if (objectHasValue(DefaultPrivacyLevel, initConfiguration.defaultPrivacyLevel)) {
    configuration.defaultPrivacyLevel = initConfiguration.defaultPrivacyLevel
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
