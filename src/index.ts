import { Configuration, ConfigurationOverride } from "./core/configuration";
import { loggerModule } from "./core/logger/logger.module";
import { initMonitoring, monitor } from "./core/monitoring/monitoring";
import { errorCollectionModule } from "./errorCollection/errorCollection.module";
import { initGlobal } from "./global";

try {
  const configuration = new Configuration();

  initGlobal();
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
