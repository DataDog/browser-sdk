import { DOM_EVENT, getRelativeTime, isNumber, monitor } from '@datadog/browser-core'

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { FAKE_INITIAL_DOCUMENT } from './resourceUtils'

interface BrowserWindow extends Window {
  PerformanceObserver?: PerformanceObserver
}

export interface RumPerformanceResourceTiming {
  entryType: 'resource'
  initiatorType: string
  name: string
  startTime: number
  duration: number
  fetchStart: number
  domainLookupStart: number
  domainLookupEnd: number
  connectStart: number
  secureConnectionStart: number
  connectEnd: number
  requestStart: number
  responseStart: number
  responseEnd: number
  redirectStart: number
  redirectEnd: number
  decodedBodySize: number
  traceId?: string
}

export interface RumPerformanceLongTaskTiming {
  entryType: 'longtask'
  startTime: number
  duration: number
}

export interface RumPerformancePaintTiming {
  entryType: 'paint'
  name: 'first-paint' | 'first-contentful-paint'
  startTime: number
}

export interface RumPerformanceNavigationTiming {
  entryType: 'navigation'
  domComplete: number
  domContentLoadedEventEnd: number
  domInteractive: number
  loadEventEnd: number
}

export type RumPerformanceEntry =
  | RumPerformanceResourceTiming
  | RumPerformanceLongTaskTiming
  | RumPerformancePaintTiming
  | RumPerformanceNavigationTiming

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

export function startPerformanceCollection(lifeCycle: LifeCycle) {
  retrieveInitialDocumentResourceTiming((timing) => {
    handleRumPerformanceEntry(lifeCycle, timing)
  })
  if (supportPerformanceObject()) {
    handlePerformanceEntries(lifeCycle, performance.getEntries())
  }
  if ((window as BrowserWindow).PerformanceObserver) {
    const observer = new PerformanceObserver(
      monitor((entries) => handlePerformanceEntries(lifeCycle, entries.getEntries()))
    )
    const entryTypes = ['resource', 'navigation', 'longtask']

    // cf https://github.com/w3c/paint-timing/issues/40
    if (document.visibilityState === 'visible') {
      entryTypes.push('paint')
    }
    observer.observe({ entryTypes })

    if (supportPerformanceObject() && 'addEventListener' in performance) {
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1559377
      performance.addEventListener('resourcetimingbufferfull', () => {
        performance.clearResourceTimings()
      })
    }
  }
  if (!supportPerformanceNavigationTimingEvent()) {
    retrieveNavigationTimingWhenLoaded((timing) => {
      handleRumPerformanceEntry(lifeCycle, timing)
    })
  }
}

function retrieveInitialDocumentResourceTiming(callback: (timing: RumPerformanceResourceTiming) => void) {
  let timing: RumPerformanceResourceTiming
  const forcedAttributes = {
    entryType: 'resource' as const,
    initiatorType: FAKE_INITIAL_DOCUMENT,
  }
  if (supportPerformanceNavigationTimingEvent() && performance.getEntriesByType('navigation').length > 0) {
    const navigationEntry = performance.getEntriesByType('navigation')[0]
    timing = { ...navigationEntry.toJSON(), ...forcedAttributes }
  } else {
    const relativePerformanceTiming = computeRelativePerformanceTiming()
    timing = {
      ...relativePerformanceTiming,
      decodedBodySize: 0,
      duration: relativePerformanceTiming.responseEnd,
      name: window.location.href,
      startTime: 0,
      ...forcedAttributes,
    }
  }
  callback(timing)
}

function retrieveNavigationTimingWhenLoaded(callback: (timing: RumPerformanceNavigationTiming) => void) {
  function sendFakeTiming() {
    callback({
      ...computeRelativePerformanceTiming(),
      entryType: 'navigation',
    })
  }

  if (document.readyState === 'complete') {
    sendFakeTiming()
  } else {
    const listener = monitor(() => {
      window.removeEventListener(DOM_EVENT.LOAD, listener)
      // Send it a bit after the actual load event, so the "loadEventEnd" timing is accurate
      setTimeout(monitor(sendFakeTiming))
    })

    window.addEventListener(DOM_EVENT.LOAD, listener)
  }
}

interface IndexedPerformanceTiming extends PerformanceTiming {
  [key: string]: any
}

function computeRelativePerformanceTiming() {
  const result: Partial<IndexedPerformanceTiming> = {}
  const timing = performance.timing as IndexedPerformanceTiming
  for (const key in timing) {
    if (isNumber(timing[key])) {
      result[key] = timing[key] === 0 ? 0 : getRelativeTime(timing[key] as number)
    }
  }
  return result as PerformanceTiming
}

function handlePerformanceEntries(lifeCycle: LifeCycle, entries: PerformanceEntry[]) {
  entries.forEach((entry) => {
    if (
      entry.entryType === 'resource' ||
      entry.entryType === 'navigation' ||
      entry.entryType === 'paint' ||
      entry.entryType === 'longtask'
    ) {
      handleRumPerformanceEntry(lifeCycle, entry as RumPerformanceEntry)
    }
  })
}

function handleRumPerformanceEntry(lifeCycle: LifeCycle, entry: RumPerformanceEntry) {
  // Exclude incomplete navigation entries by filtering out those who have a loadEventEnd at 0
  if (entry.entryType === 'navigation' && entry.loadEventEnd <= 0) {
    return
  }

  lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, entry)
}
