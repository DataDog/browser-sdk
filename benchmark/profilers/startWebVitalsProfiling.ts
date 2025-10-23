import type { Page } from '@playwright/test'
import type { BrowserWindow, WebVitalsMetrics } from 'profiling.type'
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
    import('https://unpkg.com/web-vitals@5?module' as string)
      .then(({ onLCP, onCLS, onFCP, onTTFB, onINP }: WebVitalsModule) => {
        const metrics: WebVitalsMetrics = {}
        ;(window as BrowserWindow).__webVitalsMetrics__ = metrics
        const recordMetric = (name: keyof WebVitalsMetrics) => (metric: Metric) => (metrics[name] = metric.value)
        onINP(recordMetric('INP'), { reportAllChanges: true })
        onLCP(recordMetric('LCP'), { reportAllChanges: true })
        onCLS(recordMetric('CLS'), { reportAllChanges: true })
        onFCP(recordMetric('FCP'))
        onTTFB(recordMetric('TTFB'))
      })
      .catch((e) => console.error('web-vitals load failed:', e))
  })

  return {
    stopWebVitalsProfiling: async (): Promise<WebVitalsMetrics> => {
      const metrics = await page.evaluate(() => (window as BrowserWindow).__webVitalsMetrics__ || {})
      return metrics
    },
  }
}
