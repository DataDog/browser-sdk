export class Configuration {
  isCollectingError = true;
  logsEndpoint = "https://http-intake.logs.datadoghq.com/v1/input/<KEY>?ddsource=browser-agent";
  monitoringEndpoint = "https://http-intake.logs.datadoghq.com/v1/input/<KEY>";

  set apiKey(apiKey: string) {
    this.logsEndpoint = this.logsEndpoint.replace("<KEY>", apiKey);
  }
}
