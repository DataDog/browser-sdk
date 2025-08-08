import type { RelativeTime } from '@datadog/browser-core'
import { relativeNow } from '@datadog/browser-core'

export function createTimer() {
  let start: RelativeTime
  let count = 0

  return {
    start(): number {
      start = relativeNow()

      return count
    },
    stop(): number {
      const duration = relativeNow() - start

      count += duration

      return count
    },
  }
}
