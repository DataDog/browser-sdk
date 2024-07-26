import type { RelativeTime, TimeStamp } from '@datadog/browser-core'
import { getRelativeTime, isNumber } from '@datadog/browser-core'

export type RelativePerformanceTiming = {
  -readonly [key in keyof Omit<PerformanceTiming, 'toJSON'>]: RelativeTime
}

export function computeRelativePerformanceTiming() {
  const result: Partial<RelativePerformanceTiming> = {}
  const timing = performance.timing

  for (const key in timing) {
    if (isNumber(timing[key as keyof PerformanceTiming])) {
      const numberKey = key as keyof RelativePerformanceTiming
      const timingElement = timing[numberKey] as TimeStamp
      result[numberKey] = timingElement === 0 ? (0 as RelativeTime) : getRelativeTime(timingElement)
    }
  }
  return result as RelativePerformanceTiming
}
