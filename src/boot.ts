import { Configuration } from "./core/configuration";
import { loggerModule } from "./logger/logger.module";
import { monitor } from "./monitoring/monitoring.module";

export class Boot {
  constructor(private configuration: Configuration) {}

  @monitor
  init(apiKey: string) {
    this.configuration.apiKey = apiKey;
    loggerModule(this.configuration);
  }
}
