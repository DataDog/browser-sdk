import { Configuration } from "./core/configuration";
import { loggerModule } from "./logger/logger.module";
import { monitored } from "./monitoring/monitoring";

export class Boot {
  constructor(private configuration: Configuration) {}

  @monitored
  init(apiKey: string) {
    this.configuration.apiKey = apiKey;
    loggerModule(this.configuration);
  }
}
