import { keys } from "ts-transformer-keys";
import { Configuration, ConfigurationOverride } from "./core/configuration";
import { Context } from "./core/context";
import { loggerModule, LogLevel } from "./core/logger";
import { initMonitoring, monitor } from "./core/monitoring";
import { errorCollectionModule } from "./errorCollection/errorCollection";

declare global {
  interface Window {
    Datadog: Datadog;
  }
}

export interface Datadog {
  init(apiKey: string, override?: ConfigurationOverride): void;
  log(message: string, context?: Context, severity?: LogLevel): void;
  trace(message: string, context?: Context): void;
  debug(message: string, context?: Context): void;
  info(message: string, context?: Context): void;
  warn(message: string, context?: Context): void;
  error(message: string, context?: Context): void;
  setGlobalContext(context: Context): void;
  addGlobalContext(key: string, value: any): void;
}

/**
 * Avoid `TypeError: xxx is not a function`
 * if a method is not exposed
 */
export function stubDatadog() {
  const publicMethods = keys<Datadog>();
  const datadog: any = {};
  publicMethods.forEach(method => {
    datadog[method] = () => console.log(`'${method}' not available`);
  });
  window.Datadog = datadog;
}

try {
  const configuration = new Configuration();

  stubDatadog();
  initMonitoring(configuration);

  window.Datadog.init = makeInit(configuration);
} catch {
  // nothing to do
}

function makeInit(configuration: Configuration) {
  return monitor((apiKey: string, override: ConfigurationOverride = {}) => {
    configuration.apiKey = apiKey;
    configuration.apply(override);
    const logger = loggerModule(configuration);
    errorCollectionModule(configuration, logger);
  });
}
