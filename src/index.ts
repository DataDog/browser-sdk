import { loggerModule } from "./logger/logger.module";

function init(publicAPIKey: string) {
  const configuration = {
    publicAPIKey,
    logsEndpoint: "https://http-intake.logs.datadoghq.com/v1/input"
  };

  loggerModule(configuration);
}

window.Datadog = { init };
