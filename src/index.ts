import { initGlobal } from "./global";
import { loggerModule } from "./logger/logger.module";

initGlobal();
window.Datadog.init = (publicAPIKey: string) => {
  const configuration = {
    publicAPIKey,
    logsEndpoint: "https://http-intake.logs.datadoghq.com/v1/input"
  };
  loggerModule(configuration);
};
