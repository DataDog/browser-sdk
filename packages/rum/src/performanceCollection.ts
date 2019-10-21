import { monitor } from '@browser-agent/core/src/internalMonitoring'
import { Observable } from '@browser-agent/core/src/observable'
import { getRelativeTime } from '@browser-agent/core/src/utils'
import { RumSession } from './rumSession'

declare global {
  interface Window {
    PerformanceObserver?: PerformanceObserver
  }
}

function supportPerformanceObject() {
  return window.performance !== undefined && 'getEntries' in performance && 'addEventListener' in performance
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
        retrieveNavigationTimingWhenLoaded((timing) => {
          handlePerformanceEntries(session, performanceObservable, [(timing as unknown) as PerformanceEntry])
        })
      }
    }
  }

  return performanceObservable
}

interface FakePerformanceNavigationTiming {
  entryType: 'navigation'
  domComplete: number
  domContentLoadedEventEnd: number
  domInteractive: number
  loadEventEnd: number
}

function retrieveNavigationTimingWhenLoaded(callback: (timing: FakePerformanceNavigationTiming) => void) {
  function sendFakeTiming() {
    callback({
      domComplete: getRelativeTime(performance.timing.domComplete),
      domContentLoadedEventEnd: getRelativeTime(performance.timing.domContentLoadedEventEnd),
      domInteractive: getRelativeTime(performance.timing.domInteractive),
      entryType: 'navigation',
      loadEventEnd: getRelativeTime(performance.timing.loadEventEnd),
    })
  }

  if (document.readyState === 'complete') {
    sendFakeTiming()
  } else {
    const listener = () => {
      window.removeEventListener('load', listener)
      // Send it a bit after the actual load event, so the "loadEventEnd" timing is accurate
      setTimeout(monitor(sendFakeTiming))
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
