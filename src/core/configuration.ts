const domain = buildEnv.TARGET_ENV === 'production' ? 'datadoghq.com' : 'datad0g.com'
const key = '<KEY>'

export const DEFAULT_CONFIGURATION = {
  isCollectingError: true,
  logsEndpoint: `https://http-intake.logs.${domain}/v1/input/${key}?ddsource=browser-agent`,
  monitoringEndpoint: `https://http-intake.logs.${domain}/v1/input/${key}`,

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
  isCollectingError?: boolean
  logsEndpoint?: string
  monitoringEndpoint?: string
}

export type Configuration = typeof DEFAULT_CONFIGURATION

export function buildConfiguration(userConfiguration: UserConfiguration): Configuration {
  const configuration = { ...DEFAULT_CONFIGURATION }
  configuration.logsEndpoint = configuration.logsEndpoint.replace(key, userConfiguration.apiKey)
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
