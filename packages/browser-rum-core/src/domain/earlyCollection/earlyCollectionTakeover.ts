import { relativeToClocks } from '@datadog/js-core/time'
import type { ClocksState } from '@datadog/js-core/time'
import { monitorError } from '@datadog/js-core/monitor'
import { globalObject, mockable } from '@datadog/js-core/util'
import type { Profiler } from '@datadog/js-core/util'
import {
  computeRawError,
  EARLY_COLLECTION_GLOBAL_NAME,
  EarlyCollectionEntryType,
  ErrorHandling,
  ErrorSource,
  NonErrorPrefix,
  readEarlyCollection,
  trackRuntimeError,
} from '@datadog/browser-core'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

/**
 * A Profiler instance started by the early collection package, along with the
 * time it started, so the profiler chunk can adopt it as its first instance
 * and keep the samples collected while it was downloading.
 */
export interface EarlyCollectionProfilerTakeover {
  /** The running Profiler instance to adopt. */
  readonly profiler: Profiler
  /** High resolution time when the Profiler instance started. */
  readonly startClocks: ClocksState
}

/**
 * Profiler takeover claimed at init, waiting for the profiler chunk to adopt
 * it (or for the SDK to stop it when profiling will not happen, see
 * `stopEarlyCollectionProfiler`).
 *
 * The SDK is the only party that knows whether profiling will happen (session
 * and sampling decisions are made at init), so it claims the Profiler instance
 * from the early collection global at init, and the profiler chunk adopts it
 * when it is loaded later.
 */
let earlyProfilerTakeover: EarlyCollectionProfilerTakeover | undefined

/**
 * Takes over the data collected by the early collection package, when it is
 * present. Called by the RUM public API at init (the entry provides this
 * function through its options), in the same synchronous block as the rest
 * of the SDK start, so there is no collection boundary for errors. It first
 * installs the SDK error instrumentation (the early listeners keep recording
 * raw errors until then, see `startBufferingData`), then processes the raw
 * errors buffered by the early collection package and replays them through
 * the error pipeline, so they become events attributed to the initial view
 * like the errors the SDK buffers itself between bundle evaluation and
 * init. This is the deliberate cost move: the early package only buffered
 * raw Error objects, all processing (stack parsing via `computeStackTrace`)
 * happens here, at init time. Finally, it claims the Profiler instance for
 * the profiler chunk (see `takeEarlyCollectionProfiler`), seals the early
 * collection and deletes its global so no other SDK instance adopts the same
 * data twice.
 *
 * No-op when the early collection package is not present, or when its
 * contract is not recognized.
 */
export function takeOverEarlyCollection(lifeCycle: LifeCycle): void {
  const earlyCollection = readEarlyCollection()
  if (!earlyCollection) {
    return
  }

  mockable(trackRuntimeError)().subscribe((rawError) =>
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error: rawError })
  )

  for (const entry of earlyCollection.buffer) {
    // The early collection is a separate artifact: stay resilient to malformed
    // entries, they must never break the SDK init.
    if (!Array.isArray(entry) || typeof entry[1] !== 'number') {
      continue
    }
    const [entryType, relativeStart, data] = entry
    if (entryType !== EarlyCollectionEntryType.RUNTIME_ERROR) {
      continue
    }
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, {
      error: computeRawError({
        originalError: data,
        startClocks: relativeToClocks(relativeStart),
        nonErrorPrefix: NonErrorPrefix.UNCAUGHT,
        source: ErrorSource.SOURCE,
        handling: ErrorHandling.UNHANDLED,
      }),
    })
  }

  // Claim the Profiler instance for the profiler chunk. Its shape is only
  // validated here, at claim time: the takeover is the single point where the
  // early collection data enters the SDK.
  if (isProfiler(earlyCollection.profiler)) {
    earlyProfilerTakeover = {
      profiler: earlyCollection.profiler,
      startClocks: earlyCollection.startClocks,
    }
  }

  earlyCollection.stop()
  delete (globalObject as { [EARLY_COLLECTION_GLOBAL_NAME]?: unknown })[EARLY_COLLECTION_GLOBAL_NAME]
}

/**
 * Returns the Profiler instance started by the early collection package, if
 * any, and clears it: the instance can be adopted only once (e.g. if RUM is
 * re-initialized).
 *
 * Returns `undefined` when the early collection package did not run or failed
 * to start a usable Profiler.
 */
export function takeEarlyCollectionProfiler(): EarlyCollectionProfilerTakeover | undefined {
  const takeover = earlyProfilerTakeover
  earlyProfilerTakeover = undefined
  return takeover
}

/**
 * Stops the Profiler instance started by the early collection package and
 * discards its samples, when the profiler chunk has not adopted it yet. When
 * the chunk already adopted it, this is a no-op (adoption clears the takeover
 * state).
 *
 * The SDK is the only party that knows whether profiling will happen (session
 * and sampling decisions), so it is responsible for stopping the early
 * Profiler when it will not: otherwise its samples would stay pinned in memory
 * until the page is unloaded. They cannot be sent without the profiler chunk
 * anyway.
 */
export function stopEarlyCollectionProfiler(): void {
  const takeover = takeEarlyCollectionProfiler()
  if (takeover) {
    void takeover.profiler.stop().catch(monitorError)
  }
}

function isProfiler(value: unknown): value is Profiler {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as { stopped?: unknown; stop?: unknown; sampleInterval?: unknown }
  return (
    candidate.stopped !== true && typeof candidate.stop === 'function' && typeof candidate.sampleInterval === 'number'
  )
}
