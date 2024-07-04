import type { ProfilingOptions } from '../profilingTypes'

export function isSdkBundleUrl(options: ProfilingOptions, url: string) {
  return url === options.bundleUrl
}
