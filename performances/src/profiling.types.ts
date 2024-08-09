import type { Page } from 'puppeteer'
import type { Proxy } from './proxy'

export interface Scenario {
  description: string
  run(this: void, page: Page, takeMeasurements: () => Promise<void>): Promise<void>
}

export interface ProfilingOptions {
  bundleUrl: string
  proxy: Proxy
  startRecording: boolean
}

export interface ProfilingResults {
  memory: ProfilingResult
  cpu: ProfilingResult
  download: number
  upload: RequestStatsForHost[]
}

export interface ProfilingResult {
  sdk: number
  total: number
}

export interface RequestStatsForHost {
  host: string
  requestsCount: number
  requestsSize: number
}
