import type { Profiler } from './types'

// These APIs might be unavailable in some browsers
const globalThisProfiler: Profiler | undefined = (globalThis as any).Profiler

export function isProfilingSupported(): boolean {
  return globalThisProfiler !== undefined
}
