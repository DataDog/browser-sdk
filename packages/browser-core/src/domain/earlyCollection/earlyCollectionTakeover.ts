import { relativeToClocks } from '@datadog/js-core/time'
import type { ClocksState } from '@datadog/js-core/time'
import { monitorError } from '@datadog/js-core/monitor'
import { globalObject, mockable } from '@datadog/js-core/util'
import type { Observable, Profiler } from '@datadog/js-core/util'
import { computeRawError } from '../error/error'
import { ErrorHandling, ErrorSource, NonErrorPrefix } from '../error/error.types'
import type { RawError } from '../error/error.types'
import { trackRuntimeError } from '../error/trackRuntimeError'
import type { EarlyCollectionProfilerTakeover } from './earlyCollection'
import { EARLY_COLLECTION_GLOBAL_NAME, EarlyCollectionEntryType, readEarlyCollection } from './earlyCollection'

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
 * present. Called by the error collection at init, in the same synchronous
 * block, so there is no collection boundary for errors. It first installs
 * the SDK error instrumentation (the early listeners keep recording raw
 * errors until then, see `startBufferingData`), then processes the raw errors
 * buffered by the early collection package and replays them through the
 * error pipeline, so they become events attributed to the initial view like
 * the errors the SDK buffers itself between bundle evaluation and init. This
 * is the deliberate cost move: the early package only buffered raw Error
 * objects, all processing (stack parsing via `computeStackTrace`) happens
 * here, at init time. Finally, it claims the Profiler instance for the
 * profiler chunk (see `takeEarlyCollectionProfiler`), seals the early
 * collection and deletes its global so no other SDK instance adopts the same
 * data twice.
 *
 * No-op when the early collection package is not present, or when its
 * contract is not recognized.
 */
export function takeOverEarlyCollection(errorObservable: Observable<RawError>): void {
  const earlyCollection = readEarlyCollection()
  if (!earlyCollection) {
    return
  }

  mockable(trackRuntimeError)().subscribe((rawError) => errorObservable.notify(rawError))

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
    errorObservable.notify(
      computeRawError({
        originalError: data,
        startClocks: relativeToClocks(relativeStart),
        nonErrorPrefix: NonErrorPrefix.UNCAUGHT,
        source: ErrorSource.SOURCE,
        handling: ErrorHandling.UNHANDLED,
      })
    )
  }

  if (isProfiler(earlyCollection.profiler) && isClocksState(earlyCollection.startClocks)) {
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
 * Returns `undefined` when the early collection package did not run, failed to
 * start a Profiler, or its Profiler instance is not usable anymore (e.g. it
 * was stopped).
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
  if (takeover && takeover.profiler.stopped !== true) {
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

function isClocksState(value: unknown): value is ClocksState {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as { relative?: unknown; timeStamp?: unknown }
  return typeof candidate.relative === 'number' && typeof candidate.timeStamp === 'number'
}
