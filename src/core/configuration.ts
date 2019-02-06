export class Configuration {
  logsEndpoint = "https://http-intake.logs.datadoghq.com/v1/input/<KEY>?ddsource=browser-agent";
  monitoringEndpoint = "https://http-intake.logs.datadoghq.com/v1/input/<KEY>";

  set publicAPIKey(publicAPIKey: string) {
    this.logsEndpoint = this.logsEndpoint.replace("<KEY>", publicAPIKey);
  }
}
