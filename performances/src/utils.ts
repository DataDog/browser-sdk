import type { ProfilingOptions } from './types'

export function isSdkBundleUrl(options: ProfilingOptions, url: string) {
  return url === options.bundleUrl
}
