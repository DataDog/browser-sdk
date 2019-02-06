import { Boot } from "./boot";
import { Configuration } from "./core/configuration";
import { initGlobal } from "./global";

try {
  const configuration = new Configuration();
  const boot = new Boot(configuration);
  initGlobal();
  window.Datadog.init = boot.init.bind(boot);
} catch {
  // nothing to do
}
