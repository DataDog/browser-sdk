/**
 * Early Profiler start for the Datadog Browser SDK.
 *
 * This module is the source of a tiny standalone script to include as the very
 * first script of a page: it starts a JS Self-Profiling API Profiler session
 * (Chrome/Edge, requires the `Document-Policy: js-profiling` response header;
 * fails silently otherwise) before the Browser SDK bundle is loaded, so the
 * first collected profile covers the whole page load, including the SDK
 * download.
 *
 * The script has no dependency and makes no network request: evaluating it
 * starts the session. The Browser SDK takes over the Profiler instance when
 * it starts.
 *
 * It publishes it on the `window._DD_EARLY_COLLECTION` global, whose fields
 * are:
 *
 * `version`: the contract version. The Browser SDK ignores the global when
 * it does not recognize this version.
 *
 * `startClocks`: clocks captured when the session started (a
 * `performance.now()` value and the epoch time, in milliseconds).
 *
 * `profiler`: the running Profiler instance, or `undefined` when the
 * JS Self-Profiling API is not available.
 *
 * Usage requirement: evaluate it as the first script of the page, before any
 * application script: the earlier it runs, the more of the pre-SDK window is
 * covered.
 */

/** Version of the handoff contract. The SDK ignores the global on unknown versions. */
const CONTRACT_VERSION = 1

/** Same tuning as the SDK profiler: 10 ms samples, Chrome's retention bound (~90 s). */
const PROFILER_OPTIONS = { sampleInterval: 10, maxBufferSize: 9000 }

/** The `window` global published by the early collection package (contract v1). */
export interface EarlyCollectionGlobalV1 {
  version: number
  startClocks: { relative: number; timeStamp: number }
  profiler: unknown
}

/** Minimal local typing: the JS Self-Profiling API is non-standard. */
interface ProfilerConstructor {
  new (options: { sampleInterval: number; maxBufferSize: number }): unknown
}

/**
 * Starts the early Profiler session. Must run before any application script:
 * the earlier it runs, the more of the pre-SDK window is covered.
 */
export function startEarlyCollection(): void {
  // Start the Profiler when available. The constructor throws when the API or
  // the `Document-Policy: js-profiling` response header is unavailable: fail
  // silently, the global is still published so the SDK knows we ran.
  let profiler: unknown
  const ProfilerConstructor = (window as { Profiler?: ProfilerConstructor }).Profiler
  try {
    profiler = ProfilerConstructor && new ProfilerConstructor(PROFILER_OPTIONS)
  } catch {
    // Unsupported browser or missing header: this collector reports
    // unavailable.
    profiler = undefined
  }

  ;(window as { _DD_EARLY_COLLECTION?: EarlyCollectionGlobalV1 })._DD_EARLY_COLLECTION = {
    version: CONTRACT_VERSION,
    startClocks: { relative: performance.now(), timeStamp: new Date().getTime() },
    profiler,
  }
}
