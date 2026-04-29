export interface BfcacheMetrics {
  firstContentfulPaint: number
  largestContentfulPaint: { value: number }
}

export interface BfcacheTracker {
  get(): BfcacheMetrics | undefined
}

export function trackBfcache(viewStartTime: number): BfcacheTracker {
  let metrics: BfcacheMetrics | undefined

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const paintTime = performance.now() - viewStartTime
      metrics = {
        firstContentfulPaint: paintTime,
        largestContentfulPaint: { value: paintTime },
      }
    })
  })

  return {
    get() {
      return metrics
    },
  }
}
