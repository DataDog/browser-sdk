import type { Proxy } from './proxy'

export interface ProfilingOptions {
  bundleUrl: string
  proxy: Proxy
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
