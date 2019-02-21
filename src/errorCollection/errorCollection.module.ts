import { Configuration } from "../core/configuration";
import { Logger } from "../core/logger/logger";
import { startConsoleTracking } from "./consoleTracker";
import { startRuntimeErrorTracking } from "./runtimeErrorTracker";

export function errorCollectionModule(configuration: Configuration, logger: Logger) {
  if (configuration.isCollectingError) {
    startConsoleTracking(logger);
    startRuntimeErrorTracking(logger);
  }
}
