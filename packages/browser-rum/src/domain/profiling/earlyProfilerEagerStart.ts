import { clocksNow } from '@datadog/js-core/time'
import { globalObject } from '@datadog/js-core/util'
import { createProfilerInstance } from './createProfilerInstance'
import { EARLY_PROFILER_GLOBAL_NAME } from './earlyProfilerConstants'
import { DEFAULT_RUM_PROFILER_CONFIGURATION } from './defaultProfilerConfiguration'

/** Type of the `window` global set by the early profiler snippet. */
interface EarlyProfilerGlobal {
  [EARLY_PROFILER_GLOBAL_NAME]?: unknown
}

/**
 * Eagerly starts the Profiler when the SDK bundle is evaluated, before
 * `init()` is called — the same idea as the early data collection for
 * resources and errors (`startBufferingData()` runs at bundle evaluation too).
 *
 * The running instance is exposed through the same `window` global as the
 * early profiler snippet (`EARLY_PROFILER_GLOBAL_NAME`), so the profiler chunk
 * adopts it as its first periodic instance when it loads, and the first
 * collected profile covers the early collection period.
 *
 * Like the snippet, collection starts unconditionally: no session or sampling
 * decision exists that early. The SDK stops the instance and discards its
 * samples at init when profiling won't happen (no session, not sampled,
 * unsupported browser), or when the profiler chunk fails to load.
 *
 * Also like the snippet, it fails silently when the Profiler API is
 * unavailable or the page is missing the `Document-Policy: js-profiling`
 * response header: the profiler chunk surfaces its own startup errors when it
 * takes over.
 */
export function startEarlyProfiler(): void {
  const earlyProfilerGlobal = globalObject as EarlyProfilerGlobal

  // If the early profiler snippet already started collection even earlier
  // (it runs before the SDK bundle is loaded), keep its instance: it covers a
  // longer window.
  if (earlyProfilerGlobal[EARLY_PROFILER_GLOBAL_NAME] !== undefined) {
    return
  }

  const created = createProfilerInstance(DEFAULT_RUM_PROFILER_CONFIGURATION)
  if (created.state === 'error') {
    // Fail silently like the snippet. The chunk reports its own startup
    // errors, and profiling still works normally from chunk load onward.
    return
  }

  earlyProfilerGlobal[EARLY_PROFILER_GLOBAL_NAME] = {
    profiler: created.profiler,
    startClocks: clocksNow(),
  }
}
