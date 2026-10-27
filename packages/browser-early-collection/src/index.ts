/**
 * Early data collection for the Datadog Browser SDK.
 *
 * This module is the source of a tiny standalone script to include as the very
 * first script of a page: it starts collecting the data that is otherwise lost
 * before the Browser SDK bundle is loaded and evaluated:
 *
 * - uncaught errors and unhandled rejections, kept as raw data (the original
 * Error objects and messages: no stack parsing, no formatting), and
 * - a JS Self-Profiling API Profiler session (Chrome/Edge, requires the
 * `Document-Policy: js-profiling` response header; fails silently
 * otherwise).
 *
 * The script has no dependency and makes no network request: evaluating it
 * starts the collection. The collected data is handed over to the Browser SDK
 * when it starts, then sealed.
 *
 * It publishes the collected data on the `window._DD_EARLY_COLLECTION` global,
 * whose fields are:
 *
 * `version`: the contract version. The Browser SDK ignores the global when
 * it does not recognize this version.
 *
 * `startClocks`: clocks captured when the collection started (a
 * `performance.now()` value and the epoch time, in milliseconds).
 *
 * `buffer`: `[type, timestamp, data]` entries, where the type `0` is a runtime
 * error, `timestamp` is a `performance.now()` value and `data` is whatever the
 * browser reported (usually an Error object, or a message). The buffer is
 * capped at 500 entries.
 *
 * `profiler`: the running Profiler instance, or `undefined` when the
 * JS Self-Profiling API is not available.
 *
 * `stop()`: seals the collection. Idempotent: the error handlers stay
 * installed but stop recording, so the SDK can collect on top of them
 * without duplicates.
 *
 * Usage requirement: evaluate it as the first script of the page, before any
 * application script: the earlier it runs, the more of the pre-SDK window is
 * covered.
 */

/** Version of the handoff contract. The SDK ignores the global on unknown versions. */
const CONTRACT_VERSION = 1

/** Entry type of buffered entries: only runtime errors are buffered in this version. */
const RUNTIME_ERROR_ENTRY = 0

/** Same bound as the SDK buffered observables. */
const BUFFER_LIMIT = 500

/** Same tuning as the SDK profiler: 10 ms samples, Chrome's retention bound (~90 s). */
const PROFILER_OPTIONS = { sampleInterval: 10, maxBufferSize: 9000 }

/** The `window` global published by the early collection package (contract v1). */
export interface EarlyCollectionGlobalV1 {
  version: number
  startClocks: { relative: number; timeStamp: number }
  buffer: Array<[number, number, unknown]>
  profiler: unknown
  stop: () => void
}

/** Minimal local typing: the JS Self-Profiling API is non-standard. */
interface ProfilerConstructor {
  new (options: { sampleInterval: number; maxBufferSize: number }): unknown
}

/**
 * Starts the early collection. Must run before any application script: the
 * earlier it runs, the more of the pre-SDK window is covered.
 */
export function startEarlyCollection(): void {
  const buffer: EarlyCollectionGlobalV1['buffer'] = []
  let sealed = false

  // Once sealed, the SDK has taken over (or discarded) the collection: stay
  // inert and never record again. The handlers stay installed: the SDK
  // instruments on top of them without double-counting.
  function push(data: unknown) {
    if (sealed || buffer.length >= BUFFER_LIMIT) {
      return
    }
    buffer.push([RUNTIME_ERROR_ENTRY, performance.now(), data])
  }

  // Raw error data: no stack parsing, no formatting here. The SDK processes
  // the entries with its own error pipeline when it starts.
  //
  // The handlers are assigned as event handler properties and chain to any
  // handler set before (the script is expected to run first, so there usually
  // is none). The previous handlers' return values are not propagated: they
  // are only used by browsers to let an handler suppress the default error
  // report, which does not apply to this script's purpose.
  const previousOnError = window.onerror
  window.onerror = function (messageObj, url, line, column, errorObj) {
    push(errorObj ?? messageObj)
    void previousOnError?.(messageObj, url, line, column, errorObj)
  }

  const previousOnUnhandledRejection = window.onunhandledrejection
  window.onunhandledrejection = function (event) {
    push(event.reason)
    void previousOnUnhandledRejection?.call(window, event)
  }

  // Start the Profiler when available. The constructor throws when the API or
  // the `Document-Policy: js-profiling` response header is unavailable: the
  // error collector keeps working in that case.
  let profiler: unknown
  const ProfilerConstructor = (window as { Profiler?: ProfilerConstructor }).Profiler
  try {
    profiler = ProfilerConstructor && new ProfilerConstructor(PROFILER_OPTIONS)
  } catch {
    // Unsupported browser or missing header: this collector reports
    // unavailable, everything else keeps working.
    profiler = undefined
  }

  ;(window as { _DD_EARLY_COLLECTION?: EarlyCollectionGlobalV1 })._DD_EARLY_COLLECTION = {
    version: CONTRACT_VERSION,
    startClocks: { relative: performance.now(), timeStamp: new Date().getTime() },
    buffer,
    profiler,
    // Seal: every handler funnels through push(), which becomes a no-op.
    // Never unpatch: other code may hold references to the handlers.
    // Idempotent by construction.
    stop() {
      sealed = true
    },
  }
}
