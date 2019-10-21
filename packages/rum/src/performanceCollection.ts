import { monitor } from '@browser-agent/core/src/internalMonitoring'
import { Observable } from '@browser-agent/core/src/observable'
import { getRelativePerformanceTiming } from '@browser-agent/core/src/utils'
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
  return (
    PerformanceObserver.supportedEntryTypes !== undefined &&
    PerformanceObserver.supportedEntryTypes.includes('navigation')
  )
}

export function startPerformanceCollection(performanceObservable: Observable<PerformanceEntry>, session: RumSession) {
  if (supportPerformanceObject()) {
    handlePerformanceEntries(session, performanceObservable, performance.getEntries())
  }
  if (window.PerformanceObserver) {
    const observer = new PerformanceObserver(
      monitor((entries) => handlePerformanceEntries(session, performanceObservable, entries.getEntries()))
    )
    observer.observe({ entryTypes: ['resource', 'navigation', 'paint', 'longtask'] })

    if (supportPerformanceObject()) {
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1559377
      performance.addEventListener('resourcetimingbufferfull', () => {
        performance.clearResourceTimings()
      })

      if (!supportPerformanceNavigationTimingEvent()) {
        emulatePerformanceNavigationTiming(session, performanceObservable, performance)
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

function emulatePerformanceNavigationTiming(
  session: RumSession,
  performanceObservable: Observable<PerformanceEntry>,
  performance: Performance
) {
  function sendFakeEvent() {
    const event: { -readonly [key in keyof PerformanceNavigationTiming]?: PerformanceNavigationTiming[key] } = {
      entryType: 'navigation',
    }

    for (const timingName of performanceNavigationTimingNames) {
      event[timingName] = getRelativePerformanceTiming(performance, performance.timing[timingName])
    }

    handlePerformanceEntries(session, performanceObservable, [event as PerformanceNavigationTiming])
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
  entries: PerformanceEntry[]
) {
  function notify(entry: PerformanceEntry) {
    performanceObservable.notify(entry)
  }

  if (session.isTrackedWithResource()) {
    entries.filter((entry) => entry.entryType === 'resource').forEach(notify)
  }

  entries
    .filter((entry) => entry.entryType === 'navigation')
    // Exclude incomplete navigation entries by filtering out those who have a loadEventEnd at 0
    .filter((entry) => (entry as PerformanceNavigationTiming).loadEventEnd > 0)
    .forEach(notify)

  entries.filter((entry) => entry.entryType === 'paint').forEach(notify)
  entries.filter((entry) => entry.entryType === 'longtask').forEach(notify)
}
