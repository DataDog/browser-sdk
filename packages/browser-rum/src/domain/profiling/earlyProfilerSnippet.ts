import type { ClocksState } from '@datadog/js-core/time'
import { globalObject } from '@datadog/js-core/util'
import type { Profiler } from '@datadog/js-core/util'
import { EARLY_PROFILER_GLOBAL_NAME } from './earlyProfilerConstants'
import type { EarlyProfilerTakeover } from './types'

/** Type of the `window` global set by the early profiler snippet. */
interface EarlyProfilerGlobal {
  [EARLY_PROFILER_GLOBAL_NAME]?: unknown
}

/**
 * Reads the Profiler instance started by the early profiler snippet, so the
 * profiler chunk can adopt it as its first instance and keep the samples
 * collected while it was downloading.
 *
 * Takes ownership of the instance: the global is deleted, so it cannot be
 * adopted twice (e.g. if RUM is re-initialized).
 *
 * Returns `undefined` when the snippet did not run, failed, or its Profiler
 * instance is not usable anymore (e.g. it was stopped).
 */
export function readEarlyProfilerSnippet(): EarlyProfilerTakeover | undefined {
  const rawGlobal = (globalObject as EarlyProfilerGlobal)[EARLY_PROFILER_GLOBAL_NAME]
  if (typeof rawGlobal !== 'object' || rawGlobal === null) {
    return undefined
  }
  const { profiler, startClocks } = rawGlobal as { readonly profiler: unknown; readonly startClocks: unknown }
  if (!isProfiler(profiler) || !isClocksState(startClocks)) {
    return undefined
  }
  delete (globalObject as EarlyProfilerGlobal)[EARLY_PROFILER_GLOBAL_NAME]
  return { profiler, startClocks }
}

function isProfiler(value: unknown): value is Profiler {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as { stopped?: unknown; stop?: unknown; sampleInterval?: unknown }
  return candidate.stopped !== true && typeof candidate.stop === 'function' && typeof candidate.sampleInterval === 'number'
}

function isClocksState(value: unknown): value is ClocksState {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as { relative?: unknown; timeStamp?: unknown }
  return typeof candidate.relative === 'number' && typeof candidate.timeStamp === 'number'
}
