import type { ProfilingOptions } from '../profiling.types'

export function isSdkBundleUrl(options: ProfilingOptions, url: string) {
  return url === options.bundleUrl
}
