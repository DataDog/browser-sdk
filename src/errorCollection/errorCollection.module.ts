import { Configuration } from "../core/configuration";
import { Logger } from "../logger/logger";
import { startConsoleTracking } from "./consoleTracker";
import { startRuntimeErrorTracking } from "./runtimeErrorTracker";

export function errorCollectionModule(configuration: Configuration, logger: Logger) {
  if (configuration.errorCollection) {
    startConsoleTracking(logger);
    startRuntimeErrorTracking(logger);
  }
}
