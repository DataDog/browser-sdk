import type { RelativeTime } from '@datadog/browser-core'
import { relativeNow } from '@datadog/browser-core'

export function createTimer() {
  let counter = 0
  let start: RelativeTime = 0 as RelativeTime
  let stopped = true

  return {
    get value() {
      if (stopped) {
        return counter
      }

      return relativeNow() - start
    },
    start(): void {
      if (!stopped) {
        return
      }

      start = relativeNow()
      stopped = false
    },
    stop(): void {
      if (stopped) {
        return
      }

      counter = relativeNow() - start
      stopped = true
    },
  }
}
