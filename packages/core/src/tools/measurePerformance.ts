import type { Duration } from './utils/timeUtils'
import { elapsed, relativeNow } from './utils/timeUtils'

export function measurePerformance<T>(callback: () => T): [T, Duration] {
  const start = relativeNow()
  const result = callback()
  const end = relativeNow()
  return [result, elapsed(start, end)]
}
