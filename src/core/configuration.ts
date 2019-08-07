import { ONE_KILO_BYTE, ONE_SECOND } from './utils'

function getEndpoint(type: 'browser' | 'rum', clientToken: string, source?: string) {
  const tld = buildEnv.TARGET_DC === 'us' ? 'com' : 'eu'
  const domain = buildEnv.TARGET_ENV === 'production' ? `datadoghq.${tld}` : `datad0g.${tld}`
  const tags = `version:${buildEnv.VERSION}`
  return `https://${type}-http-intake.logs.${domain}/v1/input/${clientToken}?ddsource=${source || type}&ddtags=${tags}`
}

export const DEFAULT_CONFIGURATION = {
  isCollectingError: true,
  maxErrorsByMinute: 10000,
  maxInternalMonitoringMessagesPerPage: 15,
  sampleRate: 100,

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
  internalMonitoringApiKey?: string
  isCollectingError?: boolean
  sampleRate?: number

  // Below is only taken into account for e2e-test bundle.
  internalMonitoringEndpoint?: string
  logsEndpoint?: string
  rumEndpoint?: string
}

export type Configuration = typeof DEFAULT_CONFIGURATION & {
  logsEndpoint: string
  rumEndpoint: string
  internalMonitoringEndpoint?: string
}

export function buildConfiguration(userConfiguration: UserConfiguration): Configuration {
  const configuration: Configuration = {
    logsEndpoint: getEndpoint('browser', userConfiguration.clientToken),
    rumEndpoint: getEndpoint('rum', userConfiguration.clientToken),
    ...DEFAULT_CONFIGURATION,
  }
  if (userConfiguration.internalMonitoringApiKey) {
    configuration.internalMonitoringEndpoint = getEndpoint(
      'browser',
      userConfiguration.internalMonitoringApiKey,
      'browser-agent-internal-monitoring'
    )
  }

  if ('isCollectingError' in userConfiguration) {
    configuration.isCollectingError = !!userConfiguration.isCollectingError
  }

  if ('sampleRate' in userConfiguration) {
    configuration.sampleRate = userConfiguration.sampleRate!
  }

  if (buildEnv.TARGET_ENV === 'e2e-test') {
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

  return configuration
}
