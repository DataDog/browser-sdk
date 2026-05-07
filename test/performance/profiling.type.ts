import type { Page } from '@playwright/test'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import type { DatadogDebugger } from '@datadog/browser-debugger'

export interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
  DD_DEBUGGER?: DatadogDebugger
  __webVitalsMetrics__?: WebVitalsMetrics
  // Set by the benchmark harness once any async setup (e.g. debugger SDK + probe load)
  // has settled. Scenarios should await this before running their warmup loop so the JIT
  // optimizes against the final hot path.
  __benchmarkReady?: boolean
  // Installed by the debugger SDK after `init()`. Exposed here so test code can poll for
  // probe registration without dipping into the SDK's internals.
  $dd_probes?: (functionId: string) => unknown[] | undefined
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
