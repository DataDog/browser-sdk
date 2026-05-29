import { globalObject } from '@datadog/browser-core'
import type { Profiler } from '@datadog/browser-core'

export function isProfilingSupported(): boolean {
  const globalThis = globalObject

  // This API might be unavailable in some browsers
  const globalThisProfiler: Profiler | undefined = (globalThis as any).Profiler
  return globalThisProfiler !== undefined
}
