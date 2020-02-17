import { getRelativeTime, monitor } from '@datadog/browser-core'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { RumSession } from './rumSession'

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

function retrieveNavigationTimingWhenLoaded(callback: (timing: PerformanceNavigationTiming) => void) {
  function sendFakeTiming() {
    const timing: FakePerformanceNavigationTiming = {
      ...computeRelativePerformanceTiming(),
      entryType: 'navigation',
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

interface IndexedPerformanceTiming extends PerformanceTiming {
  [key: string]: any
}

function computeRelativePerformanceTiming() {
  const result: Partial<IndexedPerformanceTiming> = {}
  const timing = performance.timing as IndexedPerformanceTiming
  for (const key in timing) {
    if (Number.isInteger(timing[key] as any)) {
      result[key] = timing[key] === 0 ? 0 : getRelativeTime(timing[key] as number)
    }
  }
  return result as PerformanceTiming
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
