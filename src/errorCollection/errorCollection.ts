import { Configuration } from "../core/configuration";
import { Logger } from "../core/logger";
import { report, StackTrace } from "../tracekit/tracekit";

export function errorCollectionModule(configuration: Configuration, logger: Logger) {
  if (configuration.isCollectingError) {
    startConsoleTracking(logger);
    startRuntimeErrorTracking(logger);
  }
}

let originalConsoleError: (message?: any, ...optionalParams: any[]) => void;

export function startConsoleTracking(logger: Logger) {
  originalConsoleError = console.error;
  console.error = (message?: any, ...optionalParams: any[]) => {
    originalConsoleError.apply(console, [message, ...optionalParams]);
    logger.error([message, ...optionalParams].join(" "));
  };
}

export function stopConsoleTracking() {
  console.error = originalConsoleError;
}

let traceKitReporthandler: (stack: StackTrace) => void;

export function startRuntimeErrorTracking(logger: Logger) {
  traceKitReporthandler = (stack: StackTrace) => logger.error(stack.message, stack);
  report.subscribe(traceKitReporthandler);
}

export function stopRuntimeErrorTracking() {
  report.unsubscribe(traceKitReporthandler);
}
