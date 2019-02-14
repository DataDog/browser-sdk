import { Configuration } from "./core/configuration";
import { errorCollectionModule } from "./errorCollection/errorCollection.module";
import { initGlobal } from "./global";
import { loggerModule } from "./logger/logger.module";
import { initMonitoring, monitor } from "./monitoring/monitoring";

try {
  const configuration = new Configuration();

  initGlobal();
  initMonitoring(configuration);

  window.Datadog.init = makeInit(configuration);
} catch {
  // nothing to do
}

function makeInit(configuration: Configuration) {
  return monitor((apiKey: string) => {
    configuration.apiKey = apiKey;
    const logger = loggerModule(configuration);
    errorCollectionModule(logger);
  });
}
