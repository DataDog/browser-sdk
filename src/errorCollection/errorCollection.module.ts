import { Logger } from "../logger/logger";
import { startConsoleTracking } from "./consoleTracker";
import { startRuntimeErrorTracking } from "./runtimeErrorTracker";

export function errorCollectionModule(logger: Logger) {
  startConsoleTracking(logger);
  startRuntimeErrorTracking(logger);
}
