const domain = buildEnv.TARGET_ENV === 'production' ? 'datadoghq.com' : 'datad0g.com'
const key = '<KEY>'

export class Configuration {
  isCollectingError = true
  logsEndpoint = `https://http-intake.logs.${domain}/v1/input/${key}?ddsource=browser-agent`
  monitoringEndpoint = `https://http-intake.logs.${domain}/v1/input/${key}`

  /**
   * flush automatically, the value is arbitrary.
   */
  flushTimeout = 60 * 1000

  /**
   * Logs intake limit
   */
  maxBatchSize = 50
  maxMessageSize = 256 * 1024

  /**
   * beacon payload max size implementation is 64kb
   */
  batchBytesLimit = 64 * 1024

  set apiKey(apiKey: string) {
    this.logsEndpoint = this.logsEndpoint.replace(key, apiKey)
  }

  apply(override: ConfigurationOverride) {
    if ('isCollectingError' in override) {
      this.isCollectingError = override.isCollectingError!
    }
    if ('logsEndpoint' in override) {
      this.logsEndpoint = override.logsEndpoint!
    }
    if ('monitoringEndpoint' in override) {
      this.monitoringEndpoint = override.monitoringEndpoint!
    }
  }
}

/**
 * List configuration options that can be overridden by the user
 */
export interface ConfigurationOverride {
  isCollectingError?: boolean
  logsEndpoint?: string
  monitoringEndpoint?: string
}
