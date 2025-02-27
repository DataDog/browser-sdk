import { getGlobalObject } from '@datadog/browser-core'
import type { Profiler } from './types'

// eslint-disable-next-line local-rules/disallow-side-effects
const globalThis = getGlobalObject()

// This API might be unavailable in some browsers
const globalThisProfiler: Profiler | undefined = (globalThis as any).Profiler

export function isProfilingSupported(): boolean {
  return globalThisProfiler !== undefined
}
