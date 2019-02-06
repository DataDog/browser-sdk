import { Configuration } from "./core/configuration";
import { loggerModule } from "./logger/logger.module";

export class Boot {
  constructor(private configuration: Configuration) {}

  init(publicApiKey: string) {
    this.configuration.publicAPIKey = publicApiKey;
    loggerModule(this.configuration);
  }
}
