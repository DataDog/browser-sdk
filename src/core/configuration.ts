function getEndpoint(apiKey: string, source: string) {
  const tld = buildEnv.TARGET_DC === 'us' ? 'com' : 'eu'
  const domain = buildEnv.TARGET_ENV === 'production' ? `datadoghq.${tld}` : `datad0g.${tld}`
  const tags = `version:${buildEnv.VERSION}`
  return `https://browser-http-intake.logs.${domain}/v1/input/${apiKey}?ddsource=${source}&ddtags=${tags}`
}

export const DEFAULT_CONFIGURATION = {
  isCollectingError: true,
  maxMonitoringMessagesPerPage: 15,

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
   * beacon payload max size implementation is 64kb
   */
  batchBytesLimit: 64 * 1024,
}

export interface UserConfiguration {
  apiKey: string
  monitoringApiKey?: string
  isCollectingError?: boolean
  // Below is only taken into account for e2e-test bundle.
  logsEndpoint?: string
  monitoringEndpoint?: string
}

export type Configuration = typeof DEFAULT_CONFIGURATION & {
  logsEndpoint: string
  monitoringEndpoint?: string
}

export function buildConfiguration(userConfiguration: UserConfiguration): Configuration {
  const configuration: Configuration = {
    logsEndpoint: getEndpoint(userConfiguration.apiKey, 'browser-agent-logs'),
    ...DEFAULT_CONFIGURATION,
  }
  if (userConfiguration.monitoringApiKey) {
    configuration.monitoringEndpoint = getEndpoint(userConfiguration.monitoringApiKey, 'browser-agent-monitoring')
  }

  if ('isCollectingError' in userConfiguration) {
    configuration.isCollectingError = !!userConfiguration.isCollectingError
  }

  if (buildEnv.TARGET_ENV === 'e2e-test') {
    if (userConfiguration.logsEndpoint) {
      configuration.logsEndpoint = userConfiguration.logsEndpoint
    }
    if (userConfiguration.monitoringEndpoint) {
      configuration.monitoringEndpoint = userConfiguration.monitoringEndpoint
    }
  }

  return configuration
}
