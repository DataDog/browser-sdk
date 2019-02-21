import { Configuration } from "../core/configuration";
import { addGlobalContext, getCommonContext, getGlobalContext, setGlobalContext } from "../core/context";
import { HttpTransport } from "../core/httpTransport";
import { Logger } from "./logger";

export function loggerModule(configuration: Configuration) {
  const transport = new HttpTransport(configuration.logsEndpoint, () => ({
    ...getCommonContext(),
    ...getGlobalContext()
  }));
  const logger = new Logger(transport);

  window.Datadog.setGlobalContext = setGlobalContext;
  window.Datadog.addGlobalContext = addGlobalContext;
  window.Datadog.log = logger.log.bind(logger);
  window.Datadog.trace = logger.trace.bind(logger);
  window.Datadog.debug = logger.debug.bind(logger);
  window.Datadog.info = logger.info.bind(logger);
  window.Datadog.warn = logger.warn.bind(logger);
  window.Datadog.error = logger.error.bind(logger);

  return logger;
}
