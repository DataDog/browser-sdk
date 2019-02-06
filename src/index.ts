import { Boot } from "./boot";
import { Configuration } from "./core/configuration";
import { initGlobal } from "./global";
import { monitoringModule } from "./monitoring/monitoring.module";

try {
  const configuration = new Configuration();
  const boot = new Boot(configuration);
  initGlobal();

  monitoringModule(configuration);

  window.Datadog.init = boot.init.bind(boot);
} catch {
  // nothing to do
}
