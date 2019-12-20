import { addMonitoringMessage, getRelativeTime, monitor } from '@datadog/browser-core'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { RumSession } from './rumSession'
import { viewContext } from './viewTracker'

interface BrowserWindow extends Window {
  PerformanceObserver?: PerformanceObserver
}

function supportPerformanceObject() {
  return window.performance !== undefined && 'getEntries' in performance
}

function supportPerformanceNavigationTimingEvent() {
  return (
    (window as BrowserWindow).PerformanceObserver &&
    PerformanceObserver.supportedEntryTypes !== undefined &&
    PerformanceObserver.supportedEntryTypes.includes('navigation')
  )
}

export function startPerformanceCollection(lifeCycle: LifeCycle, session: RumSession) {
  if (supportPerformanceObject()) {
    handlePerformanceEntries(session, lifeCycle, performance.getEntries())
  }
  if ((window as BrowserWindow).PerformanceObserver) {
    const observer = new PerformanceObserver(
      monitor((entries) => handlePerformanceEntries(session, lifeCycle, entries.getEntries()))
    )
    observer.observe({ entryTypes: ['resource', 'navigation', 'paint', 'longtask'] })

    if (supportPerformanceObject() && 'addEventListener' in performance) {
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1559377
      performance.addEventListener('resourcetimingbufferfull', () => {
        performance.clearResourceTimings()
      })
    }
  }
  if (!supportPerformanceNavigationTimingEvent()) {
    retrieveNavigationTimingWhenLoaded((timing) => {
      handlePerformanceEntries(session, lifeCycle, [timing])
    })
  }
}

interface FakePerformanceNavigationTiming {
  entryType: 'navigation'
  domComplete: number
  domContentLoadedEventEnd: number
  domInteractive: number
  loadEventEnd: number
}

function reportAbnormalTimeOrigin() {
  if (getRelativeTime(performance.timing.loadEventEnd) > 86400e3 /* 1 day in ms */) {
    addMonitoringMessage(
      `Got an abnormal loadEventEnd timing
Session Id: ${viewContext.sessionId}
View Id: ${viewContext.id}
timeOrigin: ${performance.timeOrigin}
navigationStart: ${performance.timing.navigationStart}
loadEventEnd: ${performance.timing.loadEventEnd}
timing: ${getRelativeTime(performance.timing.loadEventEnd)}`
    )
  }
}

function retrieveNavigationTimingWhenLoaded(callback: (timing: PerformanceNavigationTiming) => void) {
  function sendFakeTiming() {
    reportAbnormalTimeOrigin()
    const timing: FakePerformanceNavigationTiming = {
      domComplete: getRelativeTime(performance.timing.domComplete),
      domContentLoadedEventEnd: getRelativeTime(performance.timing.domContentLoadedEventEnd),
      domInteractive: getRelativeTime(performance.timing.domInteractive),
      entryType: 'navigation',
      loadEventEnd: getRelativeTime(performance.timing.loadEventEnd),
    }
    callback((timing as unknown) as PerformanceNavigationTiming)
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

function handlePerformanceEntries(session: RumSession, lifeCycle: LifeCycle, entries: PerformanceEntry[]) {
  function notify(entry: PerformanceEntry) {
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, entry)
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
