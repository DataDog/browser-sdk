import { Configuration } from "../core/configuration";
import { addGlobalContext, getCommonContext, getGlobalContext, setGlobalContext } from "../core/context";
import { Batch, flushOnPageHide } from "../core/transport/batch";
import { HttpTransport } from "../core/transport/httpTransport";
import { Logger } from "./logger";

export interface Message {
  message: string;
  severity?: string;
  [key: string]: any;
}

export function loggerModule(configuration: Configuration) {
  const transport = new HttpTransport(configuration.logsEndpoint);
  const batch = new Batch(transport, configuration.maxBatchSize, () => ({
    ...getCommonContext(),
    ...getGlobalContext()
  }));
  flushOnPageHide(batch);
  const logger = new Logger(batch);

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
