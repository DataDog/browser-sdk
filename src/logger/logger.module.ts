import { Configuration } from "../core/configuration";
import { HttpTransport } from "../core/httpTransport";
import { Datadog } from "../global";
import { Logger } from "./logger";

export function loggerModule(global: Datadog, configuration: Configuration) {
  const logTransport = new HttpTransport(`${configuration.logsEndpoint}/${configuration.publicAPIKey}`);
  const logger = new Logger(logTransport);

  global.log = logger.log.bind(logger);
}
