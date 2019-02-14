import { Logger } from "../logger/logger";

export function startRuntimeErrorTracking(logger: Logger) {
  window.onerror = (original => {
    const onerror = (event: Event | string, source?: string, fileno?: number, columnNumber?: number, error?: Error) => {
      if (original) {
        original.call(undefined, event, source, fileno, columnNumber, error);
      }
      logger.error(JSON.stringify(event));
    };
    onerror.__original__ = original;
    return onerror;
  })(window.onerror);
}

export function stopRuntimeErrorTracking() {
  window.onerror = (window.onerror as any).__origignal__;
}
