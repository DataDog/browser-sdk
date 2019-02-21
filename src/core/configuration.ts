export class Configuration {
  isCollectingError = true;
  logsEndpoint = "https://http-intake.logs.datadoghq.com/v1/input/<KEY>?ddsource=browser-agent";
  monitoringEndpoint = "https://http-intake.logs.datadoghq.com/v1/input/<KEY>";

  /**
   * Logs intake limit
   */
  maxBatchSize = 50;

  /**
   * beacon payload max size implementation is 64kb
   */
  batchBytesLimit = 64 * 1024;

  set apiKey(apiKey: string) {
    this.logsEndpoint = this.logsEndpoint.replace("<KEY>", apiKey);
  }

  apply(override: ConfigurationOverride) {
    if ("isCollectingError" in override) {
      this.isCollectingError = override.isCollectingError!;
    }
  }
}

/**
 * List configuration options that can be overridden by the user
 */
export interface ConfigurationOverride {
  isCollectingError?: boolean;
}
