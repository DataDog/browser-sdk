import type { Page } from '@playwright/test'
import type { BrowserWindow, WebVitalsMetrics } from '../profiling.type'
interface Metric {
  value: number
}

type RecordMetric = (callback: (metric: Metric) => void, options?: { reportAllChanges: boolean }) => void

interface WebVitalsModule {
  onLCP: RecordMetric
  onCLS: RecordMetric
  onFCP: RecordMetric
  onTTFB: RecordMetric
  onINP: RecordMetric
}

export async function startWebVitalsProfiling(page: Page) {
  await page.addInitScript(() => {
    const metrics: WebVitalsMetrics = {}
    ;(window as BrowserWindow).__webVitalsMetrics__ = metrics
    import('https://unpkg.com/web-vitals@5?module' as string)
      .then(({ onLCP, onCLS, onFCP, onTTFB, onINP }: WebVitalsModule) => {
        const recordMetric = (name: keyof WebVitalsMetrics) => (metric: Metric) => (metrics[name] = metric.value)
        onINP(recordMetric('INP'), { reportAllChanges: true })
        onLCP(recordMetric('LCP'), { reportAllChanges: true })
        onCLS(recordMetric('CLS'), { reportAllChanges: true })
        onFCP((metric: Metric) => {
          recordMetric('FCP')(metric)
          onTBT(recordMetric('TBT'))
        })
        onTTFB(recordMetric('TTFB'))
      })
      .catch((e) => console.error('web-vitals load failed:', e))

    function onTBT(callback: (metric: Metric) => void) {
      let tbt = 0
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // Only count tasks that are longer than 50ms
          if (entry.startTime >= metrics.FCP! && entry.duration > 50) {
            // The blocking time is the duration minus 50ms
            const blockingTime = entry.duration - 50
            tbt += blockingTime
            callback({ value: tbt })
          }
        }
      })

      observer.observe({ type: 'longtask', buffered: true })
    }
  })

  return {
    stopWebVitalsProfiling: async (): Promise<WebVitalsMetrics> => {
      const metrics = await page.evaluate(() => (window as BrowserWindow).__webVitalsMetrics__ || {})
      return metrics
    },
  }
}
