import { monitor } from '@browser-agent/core/src/internalMonitoring'
import { Observable } from '@browser-agent/core/src/observable'
import { RumSession } from './rumSession'

declare global {
  interface Window {
    PerformanceObserver?: PerformanceObserver
  }
}

function supportPerformanceObject() {
  return window.performance !== undefined && 'getEntriesByType' in performance && 'addEventListener' in performance
}

function supportPerformanceNavigationTimingEvent() {
  if (PerformanceObserver.supportedEntryTypes) {
    return PerformanceObserver.supportedEntryTypes.includes('navigation')
  }

  return supportPerformanceObject() && performance.getEntriesByType('navigation').length > 0
}

export function startPerformanceCollection(performanceObservable: Observable<PerformanceEntry>, session: RumSession) {
  if (supportPerformanceObject()) {
    handlePerformanceEntries(session, performanceObservable, performance)
  }
  if (window.PerformanceObserver) {
    const observer = new PerformanceObserver(
      monitor((entries) => handlePerformanceEntries(session, performanceObservable, entries))
    )
    observer.observe({ entryTypes: ['resource', 'navigation', 'paint', 'longtask'] })

    if (supportPerformanceObject()) {
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1559377
      performance.addEventListener('resourcetimingbufferfull', () => {
        performance.clearResourceTimings()
      })

      if (!supportPerformanceNavigationTimingEvent()) {
        emulatePerformanceNavigationTiming(performanceObservable, performance)
      }
    }
  }

  return performanceObservable
}

const performanceNavigationTimingNames = [
  'domComplete' as 'domComplete',
  'domContentLoadedEventEnd' as 'domContentLoadedEventEnd',
  'domInteractive' as 'domInteractive',
  'loadEventEnd' as 'loadEventEnd',
]

function getRelativePerformanceTiming<T extends Exclude<keyof PerformanceTiming, 'toJSON'>>(
  performance: Performance,
  name: T
) {
  return performance.timing[name] - performance.timeOrigin
}

function emulatePerformanceNavigationTiming(
  performanceObservable: Observable<PerformanceEntry>,
  performance: Performance
) {
  function sendFakeEvent() {
    const event: { -readonly [key in keyof PerformanceNavigationTiming]?: PerformanceNavigationTiming[key] } = {
      entryType: 'navigation',
    }

    for (const timingName of performanceNavigationTimingNames) {
      event[timingName] = getRelativePerformanceTiming(performance, timingName)
    }

    event.duration = event.loadEventEnd

    performanceObservable.notify(event as PerformanceNavigationTiming)
  }

  if (document.readyState === 'complete') {
    sendFakeEvent()
  } else {
    const listener = () => {
      window.removeEventListener('load', listener)
      // Send it a bit after the actual load event, so the "loadEventEnd" timing is accurate
      setTimeout(monitor(sendFakeEvent))
    }

    window.addEventListener('load', listener)
  }
}

function handlePerformanceEntries(
  session: RumSession,
  performanceObservable: Observable<PerformanceEntry>,
  entries: Performance | PerformanceObserverEntryList
) {
  if (session.isTrackedWithResource()) {
    entries.getEntriesByType('resource').forEach((entry) => performanceObservable.notify(entry))
  }
  entries
    .getEntriesByType('navigation')
    .forEach((entry) => (entry as PerformanceNavigationTiming).loadEventEnd > 0 && performanceObservable.notify(entry))
  entries.getEntriesByType('paint').forEach((entry) => performanceObservable.notify(entry))

  if (entries !== window.performance) {
    entries.getEntriesByType('longtask').forEach((entry) => performanceObservable.notify(entry))
  }
}
