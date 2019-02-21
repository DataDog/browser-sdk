export class Configuration {
  isCollectingError = true;
  logsEndpoint = "https://http-intake.logs.datadoghq.com/v1/input/<KEY>?ddsource=browser-agent";
  monitoringEndpoint = "https://http-intake.logs.datadoghq.com/v1/input/<KEY>";

  /**
   * Logs intake limit
   */
  maxBatchSize = 50;

  set apiKey(apiKey: string) {
    this.logsEndpoint = this.logsEndpoint.replace("<KEY>", apiKey);
  }
}
