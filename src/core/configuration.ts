import { ONE_KILO_BYTE, ONE_MINUTE } from './utils'

function getEndpoint(apiKey: string, source: string) {
  const tld = buildEnv.TARGET_DC === 'us' ? 'com' : 'eu'
  const domain = buildEnv.TARGET_ENV === 'production' ? `datadoghq.${tld}` : `datad0g.${tld}`
  const tags = `version:${buildEnv.VERSION}`
  return `https://browser-http-intake.logs.${domain}/v1/input/${apiKey}?ddsource=${source}&ddtags=${tags}`
}

export const DEFAULT_CONFIGURATION = {
  isCollectingError: true,
  maxErrorsByMinute: 10000,
  maxInternalMonitoringMessagesPerPage: 15,

  /**
   * arbitrary value, byte precision not needed
   */
  requestErrorResponseLengthLimit: 32 * ONE_KILO_BYTE,

  /**
   * flush automatically, the value is arbitrary.
   */
  flushTimeout: ONE_MINUTE,

  /**
   * Logs intake limit
   */
  maxBatchSize: 50,
  maxMessageSize: 256 * ONE_KILO_BYTE,

  /**
   * beacon payload max size implementation is 64kb
   */
  batchBytesLimit: 64 * ONE_KILO_BYTE,
}

export interface UserConfiguration {
  publicApiKey: string
  internalMonitoringApiKey?: string
  isCollectingError?: boolean

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
    logsEndpoint: getEndpoint(userConfiguration.publicApiKey, 'browser'),
    rumEndpoint: getEndpoint(userConfiguration.publicApiKey, 'browser-agent'),
    ...DEFAULT_CONFIGURATION,
  }
  if (userConfiguration.internalMonitoringApiKey) {
    configuration.internalMonitoringEndpoint = getEndpoint(
      userConfiguration.internalMonitoringApiKey,
      'browser-agent-internal-monitoring'
    )
  }

  if ('isCollectingError' in userConfiguration) {
    configuration.isCollectingError = !!userConfiguration.isCollectingError
  }

  if (buildEnv.TARGET_ENV === 'e2e-test') {
    if (userConfiguration.internalMonitoringEndpoint) {
      configuration.internalMonitoringEndpoint = userConfiguration.internalMonitoringEndpoint
    }
    if (userConfiguration.logsEndpoint) {
      configuration.logsEndpoint = userConfiguration.logsEndpoint
    }
    if (userConfiguration.rumEndpoint) {
      configuration.rumEndpoint = userConfiguration.rumEndpoint
    }
  }

  return configuration
}
