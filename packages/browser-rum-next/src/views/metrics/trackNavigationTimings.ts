import type { NavigationTimings } from '../types'

interface NavigationEntry {
  responseStart: number
  domInteractive: number
  domContentLoadedEventEnd: number
  domComplete: number
  loadEventEnd: number
}

export interface NavTimingsTracker {
  process(entry: NavigationEntry): void
  get(): NavigationTimings | undefined
}

export function trackNavigationTimings(): NavTimingsTracker {
  let value: NavigationTimings | undefined

  return {
    process(entry: NavigationEntry): void {
      if (value !== undefined) {
        return
      }
      value = {
        firstByte: entry.responseStart,
        domInteractive: entry.domInteractive,
        domContentLoaded: entry.domContentLoadedEventEnd,
        domComplete: entry.domComplete,
        loadEvent: entry.loadEventEnd,
      }
    },

    get(): NavigationTimings | undefined {
      return value
    },
  }
}
