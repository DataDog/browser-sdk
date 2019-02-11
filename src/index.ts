import { Boot } from "./boot";
import { Configuration } from "./core/configuration";
import { initGlobal } from "./global";
import { initMonitoring } from "./monitoring/monitoring";

try {
  const configuration = new Configuration();
  const boot = new Boot(configuration);

  initGlobal();
  initMonitoring(configuration);

  window.Datadog.init = boot.init.bind(boot);
} catch {
  // nothing to do
}
