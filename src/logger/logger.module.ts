import { Configuration } from "../core/configuration";
import { HttpTransport } from "../core/httpTransport";
import { Logger } from "./logger";

export function loggerModule(configuration: Configuration) {
  let globalContext = {};
  const transport = new HttpTransport(configuration.logsEndpoint, () => globalContext);
  const logger = new Logger(transport);

  window.Datadog.setGlobalContext = (context: any) => (globalContext = context);
  window.Datadog.log = logger.log.bind(logger);
  window.Datadog.trace = logger.trace.bind(logger);
  window.Datadog.debug = logger.debug.bind(logger);
  window.Datadog.info = logger.info.bind(logger);
  window.Datadog.warn = logger.warn.bind(logger);
  window.Datadog.error = logger.error.bind(logger);
}
