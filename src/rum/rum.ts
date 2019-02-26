import { Logger } from "../core/logger";
import { monitor } from "../core/monitoring";

export function rumModule(logger: Logger) {
  trackPerformanceTiming(logger);
}

function trackPerformanceTiming(logger: Logger) {
  if (PerformanceObserver) {
    const observer = new PerformanceObserver(
      monitor((list: PerformanceObserverEntryList) => {
        const entries = list.getEntries();
        const data = entries.map(e => e.toJSON());
        logger.log(`[RUM Event] ${entries[0].entryType}`, { data });
      })
    );
    observer.observe({ entryTypes: ["resource", "navigation", "paint", "longtask"] });
  }
}
