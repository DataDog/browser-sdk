import type { LargestContentfulPaint } from '../types'

interface LcpEntry {
  startTime: number
  size: number
  element?: Element
}

export interface LcpTracker {
  process(entry: LcpEntry): void
  stop(): void
  get(): LargestContentfulPaint | undefined
}

export function trackLcp(): LcpTracker {
  let current: LargestContentfulPaint | undefined
  let stopped = false

  return {
    process(entry: LcpEntry): void {
      if (stopped) {
        return
      }
      const result: LargestContentfulPaint = { value: entry.startTime }
      const tagName = entry.element?.tagName
      if (tagName) {
        result.targetSelector = tagName.toLowerCase()
      }
      current = result
    },

    stop(): void {
      stopped = true
    },

    get(): LargestContentfulPaint | undefined {
      return current
    },
  }
}
