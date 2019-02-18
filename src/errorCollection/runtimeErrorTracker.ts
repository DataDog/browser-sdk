import { Logger } from "../logger/logger";

let original: ErrorEventHandler;

export function startRuntimeErrorTracking(logger: Logger) {
  original = window.onerror;
  window.onerror = (event: Event | string, source?: string, fileno?: number, columnNumber?: number, error?: Error) => {
    if (original) {
      original.call(undefined, event, source, fileno, columnNumber, error);
    }
    logger.error(JSON.stringify(event));
  };
}

export function stopRuntimeErrorTracking() {
  window.onerror = original;
}
