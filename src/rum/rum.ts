import { Logger } from "../core/logger";
import { monitor } from "../core/monitoring";

export function rumModule(logger: Logger) {
  trackPerformanceResourceTiming(logger);
}

function trackPerformanceResourceTiming(logger: Logger) {
  if (PerformanceObserver) {
    const observer = new PerformanceObserver(
      monitor((list: PerformanceObserverEntryList) => {
        const data = list.getEntries().map(e => e.toJSON());
        logger.log("[RUM Event] PerformanceResourceTiming", { data });
      })
    );
    observer.observe({ entryTypes: ["resource"] });
  }
}
