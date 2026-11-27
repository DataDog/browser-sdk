import { globalObject, Observable } from '@datadog/js-core/util'
import type { Profiler, ProfilerTrace } from '@datadog/js-core/util'
import { clocksNow } from '@datadog/js-core/time'
import type { ClocksState } from '@datadog/js-core/time'
import { monitorError } from '@datadog/js-core/monitor'
import { display } from '@datadog/browser-core'

export const EARLY_COLLECTION_GLOBAL_NAME = '_DD_EARLY_COLLECTION'

/** The global published by packages/browser-early-collection (contract v1). */
interface EarlyCollectionGlobal {
  readonly version: number
  readonly startClocks: ClocksState
  readonly profiler: Profiler | undefined
}

interface EarlyCollectionGlobalOwner {
  [EARLY_COLLECTION_GLOBAL_NAME]?: unknown
}

export interface BrowserProfiler {
  readonly startClocks: ClocksState
  readonly sampleBufferFullObservable: Observable<void>
  readonly collectionType?: 'early'
  stop: () => Promise<ProfilerTrace>
}

type BrowserProfilerCreationResult =
  | { status: 'success'; profiler: BrowserProfiler }
  | {
      status: 'error'
      reason: 'not-supported-by-browser' | 'missing-document-policy-header' | 'unexpected-exception'
    }

export function createBrowserProfiler(configuration: {
  sampleIntervalMs: number
  collectIntervalMs: number
}): BrowserProfilerCreationResult {
  const earlyProfiler = takeEarlyCollectionProfiler()
  let profiler: Profiler
  if (earlyProfiler) {
    profiler = earlyProfiler.profiler
  } else {
    const profilerConstructor = globalObject.Profiler
    if (!profilerConstructor) {
      return { status: 'error', reason: 'not-supported-by-browser' }
    }

    try {
      profiler = new profilerConstructor({
        sampleInterval: configuration.sampleIntervalMs,
        // Allow 1.5 collection intervals of samples before the buffer fills.
        maxBufferSize: Math.round((configuration.collectIntervalMs * 1.5) / configuration.sampleIntervalMs),
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes('disabled by Document Policy')) {
        display.warn(
          '[DD_RUM] Profiler startup failed. Ensure your server includes the `Document-Policy: js-profiling` response header when serving HTML pages.',
          error
        )
        return { status: 'error', reason: 'missing-document-policy-header' }
      }
      return { status: 'error', reason: 'unexpected-exception' }
    }
  }

  const startClocks = earlyProfiler?.startClocks ?? clocksNow()
  const sampleBufferFullObservable = new Observable<void>()
  const onBufferFull = () => sampleBufferFullObservable.notify()
  // eslint-disable-next-line local-rules/disallow-zone-js-patched-values -- FIXME use the `addEventListener` helper
  profiler.addEventListener('samplebufferfull', onBufferFull)

  return {
    status: 'success',
    profiler: {
      startClocks,
      sampleBufferFullObservable,
      collectionType: earlyProfiler ? 'early' : undefined,
      stop() {
        // eslint-disable-next-line local-rules/disallow-zone-js-patched-values -- FIXME use the `addEventListener` helper
        profiler.removeEventListener('samplebufferfull', onBufferFull)
        return profiler.stop()
      },
    },
  }
}

/** Discards an unclaimed early profiler, including before the profiler chunk loads. */
export function stopEarlyCollectionProfiler(): void {
  void takeEarlyCollectionProfiler()?.profiler.stop().catch(monitorError)
}

/** Transfers ownership once, preserving other fields on the early collection global. */
function takeEarlyCollectionProfiler(): { profiler: Profiler; startClocks: ClocksState } | undefined {
  const owner = globalObject as EarlyCollectionGlobalOwner
  const rawGlobal = owner[EARLY_COLLECTION_GLOBAL_NAME]
  if (typeof rawGlobal !== 'object' || rawGlobal === null) {
    return undefined
  }
  const { version, profiler, startClocks } = rawGlobal as EarlyCollectionGlobal
  if (version !== 1 || !profiler || profiler.stopped) {
    // Unknown contracts and unusable instances are left untouched.
    return undefined
  }
  delete (rawGlobal as { profiler?: Profiler }).profiler
  return { profiler, startClocks }
}
