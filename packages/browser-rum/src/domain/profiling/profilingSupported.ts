import { globalObject } from '@openobserve/browser-core'

export function isProfilingSupported(): boolean {
  // This API might be unavailable in some browsers
  return globalObject.Profiler !== undefined
}
