import { Logger } from "../logger/logger";
import { startConsoleTracking } from "./consoleTracker";

export function errorCollectionModule(logger: Logger) {
  startConsoleTracking(logger);
}
