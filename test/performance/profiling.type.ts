import type { Page } from '@playwright/test'
import type { RumPublicApi } from '@datadog/browser-rum-core'

export interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
  __webVitalsMetrics__?: WebVitalsMetrics
}

export interface Scenario {
  description: string
  run(this: void, page: Page, takeMeasurements: () => Promise<void>): Promise<void>
}

export interface Metrics extends WebVitalsMetrics {
  memory: number
  cpu: number
  upload: number
  download: number
}

export interface WebVitalsMetrics {
  LCP?: number
  CLS?: number
  FCP?: number
  TTFB?: number
  INP?: number
  TBT?: number
}
