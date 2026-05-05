import type { LargestContentfulPaint } from '../types'

interface LcpEntry {
  startTime: number
  size: number
  element?: Element
  url?: string
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

      // Resource URL (empty string means not available per the spec)
      const resourceUrl = entry.url && entry.url !== '' ? entry.url : undefined
      if (resourceUrl) {
        result.resourceUrl = resourceUrl
      }

      // Compute sub_parts using Navigation + Resource timing
      const subParts = computeSubParts(resourceUrl, entry.startTime)
      if (subParts) {
        result.subParts = subParts
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

function computeSubParts(
  resourceUrl: string | undefined,
  lcpValue: number
): LargestContentfulPaint['subParts'] | undefined {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return undefined
  }

  // Get TTFB from navigation timing
  const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
  const navEntry = navEntries[0]
  if (!navEntry || !navEntry.responseStart) {
    return undefined
  }
  const firstByte = navEntry.responseStart

  // Find the matching resource entry
  const resourceEntry = resourceUrl ? findLcpResourceEntry(resourceUrl, lcpValue) : undefined

  // lcpRequestStart: when the LCP resource request started
  const lcpRequestStart = resourceEntry
    ? Math.max(firstByte, resourceEntry.requestStart || resourceEntry.startTime)
    : firstByte

  // lcpResponseEnd: when the LCP resource finished loading, capped at LCP time
  const lcpResponseEnd = Math.min(lcpValue, Math.max(lcpRequestStart, resourceEntry?.responseEnd || 0))

  return {
    loadDelay: lcpRequestStart - firstByte,
    loadTime: lcpResponseEnd - lcpRequestStart,
    renderDelay: lcpValue - lcpResponseEnd,
  }
}

function findLcpResourceEntry(url: string, lcpValue: number): PerformanceResourceTiming | undefined {
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  let match: PerformanceResourceTiming | undefined
  for (const entry of entries) {
    if (entry.name === url && entry.startTime <= lcpValue) {
      if (!match || entry.startTime > match.startTime) {
        match = entry
      }
    }
  }
  return match
}
