import { BuildEnv } from '../../boot/init'
import { CookieOptions, getCurrentSite } from '../../browser/cookie'
import { catchUserErrors } from '../../tools/catchUserErrors'
import { display } from '../../tools/display'
import { isPercentage, ONE_KILO_BYTE, ONE_SECOND } from '../../tools/utils'
import { updateExperimentalFeatures } from './experimentalFeatures'
import { computeTransportConfiguration, TransportConfiguration } from './transportConfiguration'

export const DefaultPrivacyLevel = {
  ALLOW: 'allow',
  MASK: 'mask',
  MASK_USER_INPUT: 'mask-user-input',
} as const
export type DefaultPrivacyLevel = typeof DefaultPrivacyLevel[keyof typeof DefaultPrivacyLevel]

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

export interface Configuration extends TransportConfiguration {
  // Built from init configuration
  beforeSend: BeforeSendCallback | undefined
  cookieOptions: CookieOptions
  sampleRate: number
  service: string | undefined
  silentMultipleInit: boolean

  // Event limits
  maxErrorsPerMinute: number
  maxInternalMonitoringMessagesPerPage: number
  requestErrorResponseLengthLimit: number

  // Batch configuration
  batchBytesLimit: number
  flushTimeout: number
  maxBatchSize: number
  maxMessageSize: number
}

export function validateAndBuildConfiguration(
  initConfiguration: InitConfiguration,
  buildEnv: BuildEnv
): Configuration | undefined {
  if (!initConfiguration || !initConfiguration.clientToken) {
    display.error('Client Token is not configured, we will not send any data.')
    return
  }

  if (initConfiguration.sampleRate !== undefined && !isPercentage(initConfiguration.sampleRate)) {
    display.error('Sample Rate should be a number between 0 and 100')
    return
  }

  // Set the experimental feature flags as early as possible so we can use them in most places
  updateExperimentalFeatures(initConfiguration.enableExperimentalFeatures)

  return {
    ...computeTransportConfiguration(initConfiguration, buildEnv),

    beforeSend:
      initConfiguration.beforeSend && catchUserErrors(initConfiguration.beforeSend, 'beforeSend threw an error:'),
    cookieOptions: buildCookieOptions(initConfiguration),
    sampleRate: initConfiguration.sampleRate ?? 100,
    service: initConfiguration.service,
    silentMultipleInit: !!initConfiguration.silentMultipleInit,

    /**
     * beacon payload max queue size implementation is 64kb
     * ensure that we leave room for logs, rum and potential other users
     */
    batchBytesLimit: 16 * ONE_KILO_BYTE,

    maxErrorsPerMinute: 3000,
    maxInternalMonitoringMessagesPerPage: 15,

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
  }
}

export function buildCookieOptions(initConfiguration: InitConfiguration) {
  const cookieOptions: CookieOptions = {}

  cookieOptions.secure = mustUseSecureCookie(initConfiguration)
  cookieOptions.crossSite = !!initConfiguration.useCrossSiteSessionCookie

  if (initConfiguration.trackSessionAcrossSubdomains) {
    cookieOptions.domain = getCurrentSite()
  }

  return cookieOptions
}

function mustUseSecureCookie(initConfiguration: InitConfiguration) {
  return !!initConfiguration.useSecureSessionCookie || !!initConfiguration.useCrossSiteSessionCookie
}
