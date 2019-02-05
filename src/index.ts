import { Configuration } from "./core/configuration";
import { HttpTransport } from "./core/httpTransport";
import { Logger } from "./logger/logger";

function init(publicAPIKey: string) {
  const configuration = {
    publicAPIKey,
    logsEndpoint: "https://http-intake.logs.datadoghq.com/v1/input"
  };
  wireDependencies(configuration);
}

function wireDependencies(configuration: Configuration) {
  const logTransport = new HttpTransport(`${configuration.logsEndpoint}/${configuration.publicAPIKey}`);
  const logger = new Logger(logTransport);

  window.Datadog.log = logger.log.bind(logger);
}

window.Datadog = { init };
