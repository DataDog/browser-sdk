import { Logger } from "../core/logger";
import { monitor } from "../core/monitoring";

type RequestIdleCallbackHandle = number;

interface RequestIdleCallbackOptions {
  timeout: number;
}

interface RequestIdleCallbackDeadline {
  readonly didTimeout: boolean;
  timeRemaining: () => number;
}

declare global {
  interface Window {
    requestIdleCallback: (
      callback: (deadline: RequestIdleCallbackDeadline) => void,
      opts?: RequestIdleCallbackOptions
    ) => RequestIdleCallbackHandle;
    cancelIdleCallback: (handle: RequestIdleCallbackHandle) => void;
  }
}

const RUM_EVENT_PREFIX = `[RUM Event]`;

export function rumModule(logger: Logger) {
  trackPerformanceTiming(logger);
  trackFirstIdle(logger);
}

function trackPerformanceTiming(logger: Logger) {
  if (PerformanceObserver) {
    const observer = new PerformanceObserver(
      monitor((list: PerformanceObserverEntryList) => {
        const entries = list.getEntries();
        const data = entries.map(e => e.toJSON());
        logger.log(`${RUM_EVENT_PREFIX} ${entries[0].entryType}`, { data });
      })
    );
    observer.observe({ entryTypes: ["resource", "navigation", "paint", "longtask"] });
  }
}

function trackFirstIdle(logger: Logger) {
  if (window.requestIdleCallback) {
    const handle = window.requestIdleCallback(
      monitor(() => {
        window.cancelIdleCallback(handle);
        logger.log(`${RUM_EVENT_PREFIX} first idle`, {
          data: {
            entryType: "firstIdle",
            startTime: performance.now()
          }
        });
      })
    );
  }
}
