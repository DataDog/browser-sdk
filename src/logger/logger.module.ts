import { Configuration } from "../core/configuration";
import { HttpTransport } from "../core/httpTransport";
import { Logger } from "./logger";

export function loggerModule(configuration: Configuration) {
  const logTransport = new HttpTransport(`${configuration.logsEndpoint}/${configuration.publicAPIKey}`);
  const logger = new Logger(logTransport);

  window.Datadog.log = logger.log.bind(logger);
}
