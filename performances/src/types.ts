export interface ProfilingOptions {
  bundleUrl: string
  proxyHost: string
}

export interface ProfilingResults {
  memory: ProfilingResult
  cpu: ProfilingResult
  download: ProfilingResult
  upload: ProfilingResult
}

export interface ProfilingResult {
  sdk: number
  total: number
}
