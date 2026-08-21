import { globalObject } from '@datadog/js-core/util'
export function isProfilingSupported(): boolean {
  // This API might be unavailable in some browsers
  return globalObject.Profiler !== undefined
}
