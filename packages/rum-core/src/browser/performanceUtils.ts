import type { RelativeTime, TimeStamp } from '@datadog/browser-core'
import { getRelativeTime, isNumber, relativeNow } from '@datadog/browser-core'
import { RelevantNavigationTiming } from '../domain/view/viewMetrics/trackNavigationTimings'
import type { RumPerformanceNavigationTiming } from './performanceObservable'
import { RumPerformanceEntryType, supportPerformanceTimingEvent } from './performanceObservable'

export function getNavigationEntry(): RumPerformanceNavigationTiming {
  if (supportPerformanceTimingEvent(RumPerformanceEntryType.NAVIGATION)) {
    const navigationEntry = performance.getEntriesByType(
      RumPerformanceEntryType.NAVIGATION
    )[0] as unknown as RumPerformanceNavigationTiming
    if (navigationEntry) {
      return navigationEntry
    }
  }

  const timings = computeTimingsFromDeprecatedPerformanceTiming()
  const entry: RumPerformanceNavigationTiming = {
    entryType: RumPerformanceEntryType.NAVIGATION as const,
    initiatorType: 'navigation' as const,
    name: window.location.href,
    startTime: 0 as RelativeTime,
    duration: timings.loadEventEnd,
    decodedBodySize: 0,
    encodedBodySize: 0,
    transferSize: 0,
    workerStart: 0 as RelativeTime,
    toJSON: () => ({ ...entry, toJSON: undefined }),
    ...timings,
  }

  return entry
}

export type TimingsFromDeprecatedPerformanceTiming = {
  -readonly [key in keyof Omit<PerformanceTiming, 'toJSON'>]: RelativeTime
}

export function computeTimingsFromDeprecatedPerformanceTiming() {
  const result: Partial<TimingsFromDeprecatedPerformanceTiming> = {}
  const timing = performance.timing

  for (const key in timing) {
    if (isNumber(timing[key as keyof PerformanceTiming])) {
      const numberKey = key as keyof TimingsFromDeprecatedPerformanceTiming
      const timingElement = timing[numberKey] as TimeStamp
      result[numberKey] = timingElement === 0 ? (0 as RelativeTime) : getRelativeTime(timingElement)
    }
  }
  return result as TimingsFromDeprecatedPerformanceTiming
}

export function getSafeFirstByte(entry: RelevantNavigationTiming) {
  // In some cases the value reported is negative or is larger
  // than the current page time. Ignore these cases:
  // https://github.com/GoogleChrome/web-vitals/issues/137
  // https://github.com/GoogleChrome/web-vitals/issues/162
  return entry.responseStart >= 0 && entry.responseStart <= relativeNow() ? entry.responseStart : undefined
}

