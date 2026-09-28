import { addEventListener, DOM_EVENT } from '@datadog/browser-core'
import { monitorError } from '@datadog/js-core/monitor'
import { clocksNow } from '@datadog/js-core/time'
import type { ClocksState } from '@datadog/js-core/time'
import { globalObject } from '@datadog/js-core/util'
import type { Profiler } from '@datadog/js-core/util'
import { createProfilerInstance } from './createProfilerInstance'
import { DEFAULT_RUM_PROFILER_CONFIGURATION } from './defaultProfilerConfiguration'
import type {
  EarlyProfilerStart,
  EarlyProfilerTakeover,
  RUMProfilerConfiguration,
} from './types'

/**
 * Name of the `window` global set by the early profiler snippet. The snippet is
 * a small inline `<script>` customers add to their HTML `<head>`, so collection
 * starts before the SDK bundle is even loaded:
 *
 * ```html
 * <script>
 *   window._DD_RUM_EARLY_PROFILER = function (w) {
 *     try {
 *       return {
 *         profiler: new w.Profiler({ sampleInterval: 10, maxBufferSize: 9000 }),
 *         startClocks: { relative: w.performance.now(), timeStamp: Date.now() },
 *       }
 *     } catch (e) {}
 *   }(window)
 * </script>
 * ```
 *
 * The Profiler instance and its start time are stored so the SDK can adopt them
 * when it loads, and keep the samples collected before that.
 */
export const EARLY_PROFILER_GLOBAL_NAME = '_DD_RUM_EARLY_PROFILER'

/** Type of the `window` global set by the early profiler snippet. */
interface EarlyProfilerGlobal {
  _DD_RUM_EARLY_PROFILER?: unknown
}

/**
 * Starts collecting Profiler samples before the profiler chunk is loaded, so no
 * sample is lost while the chunk is downloading.
 *
 * When possible, adopts the Profiler instance started by the early profiler
 * snippet, so samples collected before the SDK bundle was loaded are kept as
 * well. Otherwise, starts a new Profiler instance right away.
 *
 * The returned handle lets the profiler chunk take over the running instance
 * (`takeover`) once it is loaded, or stop collection if the chunk failed to
 * load (`stop`).
 */
export function startEarlyProfiler(
  profilerConfiguration: RUMProfilerConfiguration = DEFAULT_RUM_PROFILER_CONFIGURATION
): EarlyProfilerStart {
  let status: 'collecting' | 'paused' | 'stopped' = 'collecting'
  let current: EarlyProfilerTakeover | undefined

  const snippetInstance = readEarlyProfilerSnippetInstance()
  if (snippetInstance) {
    current = snippetInstance
  } else {
    const created = createProfilerInstance(profilerConfiguration)
    if (created.state === 'error') {
      return { state: 'error', errorReason: created.errorReason }
    }
    current = { profiler: created.profiler, startClocks: clocksNow() }
  }

  const stopVisibilityListener = addEventListener(window, DOM_EVENT.VISIBILITY_CHANGE, handleVisibilityChange).stop
  listenSampleBufferFull(current.profiler)

  function listenSampleBufferFull(profiler: Profiler) {
    // eslint-disable-next-line local-rules/disallow-zone-js-patched-values -- FIXME use the `addEventListener` helper
    profiler.addEventListener('samplebufferfull', handleSampleBufferFull)
  }

  function handleSampleBufferFull() {
    // The sample buffer is full and the Profiler stopped collecting samples:
    // restart a new instance to keep collecting the most recent ones. Samples
    // collected so far cannot be sent yet (the profiler chunk handling the
    // transport is not loaded), so they are discarded.
    restartProfilerInstance()
  }

  function restartProfilerInstance() {
    if (status !== 'collecting' || !current) {
      return
    }
    discardCurrentInstance()

    const created = createProfilerInstance(profilerConfiguration)
    if (created.state === 'error') {
      stopCollection()
      return
    }
    current = { profiler: created.profiler, startClocks: clocksNow() }
    listenSampleBufferFull(created.profiler)
  }

  function discardCurrentInstance() {
    if (!current) {
      return
    }
    // eslint-disable-next-line local-rules/disallow-zone-js-patched-values -- FIXME use the `addEventListener` helper
    current.profiler.removeEventListener('samplebufferfull', handleSampleBufferFull)
    void current.profiler.stop().catch(monitorError)
    current = undefined
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden' && status === 'collecting') {
      // Pause collection while the page is hidden, mirroring the behavior of
      // the profiler chunk. The Profiler API cannot be paused, so the samples
      // collected so far are discarded (they cannot be sent yet anyway).
      discardCurrentInstance()
      status = 'paused'
    } else if (document.visibilityState === 'visible' && status === 'paused') {
      // Resume collection when the page becomes visible again.
      const created = createProfilerInstance(profilerConfiguration)
      if (created.state === 'error') {
        stopCollection()
        return
      }
      current = { profiler: created.profiler, startClocks: clocksNow() }
      status = 'collecting'
      listenSampleBufferFull(created.profiler)
    }
  }

  function stopCollection() {
    discardCurrentInstance()
    status = 'stopped'
    stopVisibilityListener()
  }

  return {
    state: 'started',
    earlyProfiler: {
      takeover: () => {
        // Hand over the running Profiler instance to the profiler chunk. The
        // early collector stops managing it: from now on the profiler chunk
        // listens to its events and collects it periodically.
        if (status !== 'collecting' || !current) {
          // Collection is paused (hidden page): let the profiler chunk start a
          // new Profiler instance instead.
          stopCollection()
          return undefined
        }
        const runningInstance = current
        // eslint-disable-next-line local-rules/disallow-zone-js-patched-values -- FIXME use the `addEventListener` helper
        runningInstance.profiler.removeEventListener('samplebufferfull', handleSampleBufferFull)
        current = undefined
        status = 'stopped'
        stopVisibilityListener()
        return runningInstance
      },
      stop: stopCollection,
    },
  }
}

/**
 * Reads the Profiler instance started by the early profiler snippet, if any.
 * Returns `undefined` when the snippet did not run, failed, or its Profiler
 * instance is not usable anymore (e.g. it was stopped).
 */
function readEarlyProfilerSnippetInstance(): EarlyProfilerTakeover | undefined {
  const rawGlobal = (globalObject as EarlyProfilerGlobal)[EARLY_PROFILER_GLOBAL_NAME]
  if (typeof rawGlobal !== 'object' || rawGlobal === null) {
    return undefined
  }
  const { profiler, startClocks } = rawGlobal as { readonly profiler: unknown; readonly startClocks: unknown }
  if (!isProfiler(profiler) || !isClocksState(startClocks)) {
    return undefined
  }
  // The snippet did its job: take ownership of its instance so it is not
  // adopted twice (e.g. if RUM is re-initialized).
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
