function getEndpoint(type: 'browser' | 'rum', apiKey: string, source?: string) {
  const tld = buildEnv.TARGET_DC === 'us' ? 'com' : 'eu'
  const domain = buildEnv.TARGET_ENV === 'production' ? `datadoghq.${tld}` : `datad0g.${tld}`
  const tags = `version:${buildEnv.VERSION}`
  return `https://${type}-http-intake.logs.${domain}/v1/input/${apiKey}?ddsource=${source || type}&ddtags=${tags}`
}

export const DEFAULT_CONFIGURATION = {
  isCollectingError: true,
  maxInternalMonitoringMessagesPerPage: 15,

  /**
   * arbitrary value, byte precision not needed
   */
  requestErrorResponseLengthLimit: 32 * 1024,

  /**
   * flush automatically, the value is arbitrary.
   */
  flushTimeout: 60 * 1000,

  /**
   * Logs intake limit
   */
  maxBatchSize: 50,
  maxMessageSize: 256 * 1024,

  /**
   * beacon payload max queue size implementation is 64kb
   * ensure that we leave room for logs, rum and potential other users
   */
  batchBytesLimit: 16 * 1024,
}

export interface UserConfiguration {
  publicApiKey: string
  internalMonitoringApiKey?: string
  isCollectingError?: boolean

  // Below is only taken into account for e2e-test bundle.
  internalMonitoringEndpoint?: string
  logsEndpoint?: string
  rumEndpoint?: string
  oldRumEndpoint?: string
}

export type Configuration = typeof DEFAULT_CONFIGURATION & {
  logsEndpoint: string
  rumEndpoint: string
  oldRumEndpoint: string
  internalMonitoringEndpoint?: string
}

export function buildConfiguration(userConfiguration: UserConfiguration): Configuration {
  const configuration: Configuration = {
    logsEndpoint: getEndpoint('browser', userConfiguration.publicApiKey),
    oldRumEndpoint: getEndpoint('browser', userConfiguration.publicApiKey, 'browser-agent'),
    rumEndpoint: getEndpoint('rum', userConfiguration.publicApiKey),
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
    if (userConfiguration.oldRumEndpoint !== undefined) {
      configuration.oldRumEndpoint = userConfiguration.oldRumEndpoint
    }
  }

  return configuration
}
