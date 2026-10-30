import type { ClocksState } from '@datadog/js-core/time'
import { monitorError } from '@datadog/js-core/monitor'
import { globalObject } from '@datadog/js-core/util'
import type { Profiler } from '@datadog/js-core/util'

/**
 * Name of the `window` global published by the early collection package (see
 * `packages/browser-early-collection`): a standalone script evaluated as the
 * first script of the page, which starts a Profiler session before the SDK
 * bundle is evaluated.
 */
export const EARLY_COLLECTION_GLOBAL_NAME = '_DD_EARLY_COLLECTION'

/** The `window` global published by the early collection package (contract v1). */
interface EarlyCollectionGlobal {
  readonly version: number
  readonly startClocks: ClocksState
  readonly profiler: Profiler | undefined
}

interface EarlyCollectionGlobalOwner {
  [EARLY_COLLECTION_GLOBAL_NAME]?: unknown
}

/** A Profiler instance started by the early collection package, with the time it started. */
export interface EarlyCollectionProfiler {
  readonly profiler: Profiler
  readonly startClocks: ClocksState
}

/**
 * Takes the Profiler instance started by the early collection package, so the
 * profiler chunk can adopt it as its first instance and keep the samples
 * collected while it was downloading.
 *
 * Takes ownership of the instance: the global is deleted, so it can be taken
 * only once (e.g. when the profiler restarts). Returns `undefined` when the
 * package did not run, its contract version is not recognized, or its
 * Profiler instance is not usable anymore (already stopped).
 */
export function takeEarlyCollectionProfiler(): EarlyCollectionProfiler | undefined {
  const owner = globalObject as EarlyCollectionGlobalOwner
  const rawGlobal = owner[EARLY_COLLECTION_GLOBAL_NAME]
  if (typeof rawGlobal !== 'object' || rawGlobal === null) {
    return undefined
  }
  const { version, profiler, startClocks } = rawGlobal as EarlyCollectionGlobal
  if (version !== 1 || !profiler || profiler.stopped) {
    // Unknown contract version or unusable instance: not ours to manage, the
    // global is left untouched.
    return undefined
  }
  delete owner[EARLY_COLLECTION_GLOBAL_NAME]
  return { profiler, startClocks }
}

/**
 * Stops the Profiler instance started by the early collection package and
 * discards its samples, when the profiler chunk did not adopt it. The samples
 * cannot be sent without the profiler chunk anyway, and would stay pinned in
 * memory until the page is unloaded otherwise.
 *
 * The SDK is the only party that knows whether profiling will happen (session
 * and sampling decisions), so it is responsible for stopping the instance
 * when it will not. This is only called from the early-return paths of
 * `profilerApi`, before the profiler chunk is ever requested.
 */
export function stopEarlyCollectionProfiler(): void {
  void takeEarlyCollectionProfiler()?.profiler.stop().catch(monitorError)
}
