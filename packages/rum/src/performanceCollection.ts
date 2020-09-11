import { Configuration, DOM_EVENT, getRelativeTime, isNumber, monitor } from '@datadog/browser-core'

import { getDocumentTraceId } from './getDocumentTraceId'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { FAKE_INITIAL_DOCUMENT, isAllowedRequestUrl } from './resourceUtils'

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

export function startPerformanceCollection(lifeCycle: LifeCycle, configuration: Configuration) {
  retrieveInitialDocumentResourceTiming((timing) => {
    handleRumPerformanceEntry(lifeCycle, configuration, timing)
  })

  if (supportPerformanceObject()) {
    handlePerformanceEntries(lifeCycle, configuration, performance.getEntries())
  }
  if ((window as BrowserWindow).PerformanceObserver) {
    const observer = new PerformanceObserver(
      monitor((entries) => handlePerformanceEntries(lifeCycle, configuration, entries.getEntries()))
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
    retrieveNavigationTiming((timing) => {
      handleRumPerformanceEntry(lifeCycle, configuration, timing)
    })
  }
}

export function retrieveInitialDocumentResourceTiming(callback: (timing: RumPerformanceResourceTiming) => void) {
  runOnReadyState('interactive', () => {
    let timing: RumPerformanceResourceTiming

    const forcedAttributes = {
      entryType: 'resource' as const,
      initiatorType: FAKE_INITIAL_DOCUMENT,
      traceId: getDocumentTraceId(document),
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
  })
}

function retrieveNavigationTiming(callback: (timing: RumPerformanceNavigationTiming) => void) {
  function sendFakeTiming() {
    callback({
      ...computeRelativePerformanceTiming(),
      entryType: 'navigation',
    })
  }

  runOnReadyState('complete', () => {
    // Send it a bit after the actual load event, so the "loadEventEnd" timing is accurate
    setTimeout(monitor(sendFakeTiming))
  })
}

function runOnReadyState(expectedReadyState: 'complete' | 'interactive', callback: () => void) {
  if (document.readyState === expectedReadyState || document.readyState === 'complete') {
    callback()
  } else {
    const eventName = expectedReadyState === 'complete' ? DOM_EVENT.LOAD : DOM_EVENT.DOM_CONTENT_LOADED
    const listener = monitor(() => {
      window.removeEventListener(eventName, listener)
      callback()
    })

    window.addEventListener(eventName, listener)
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

function handlePerformanceEntries(lifeCycle: LifeCycle, configuration: Configuration, entries: PerformanceEntry[]) {
  entries.forEach((entry) => {
    if (
      entry.entryType === 'resource' ||
      entry.entryType === 'navigation' ||
      entry.entryType === 'paint' ||
      entry.entryType === 'longtask'
    ) {
      handleRumPerformanceEntry(lifeCycle, configuration, entry as RumPerformanceEntry)
    }
  })
}

function handleRumPerformanceEntry(lifeCycle: LifeCycle, configuration: Configuration, entry: RumPerformanceEntry) {
  if (isIncompleteNavigation(entry) || isForbiddenResource(configuration, entry)) {
    return
  }

  lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, entry)
}

function isIncompleteNavigation(entry: RumPerformanceEntry) {
  return entry.entryType === 'navigation' && entry.loadEventEnd <= 0
}

function isForbiddenResource(configuration: Configuration, entry: RumPerformanceEntry) {
  return entry.entryType === 'resource' && !isAllowedRequestUrl(configuration, entry.name)
}
