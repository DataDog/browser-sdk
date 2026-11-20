import { globalObject } from '@datadog/js-core/util'
import type { Profiler, ProfilerTrace } from '@datadog/js-core/util'
import { display } from '@datadog/browser-core'

export interface BrowserProfiler {
  stop: () => Promise<ProfilerTrace>
}

type BrowserProfilerCreationResult =
  | { status: 'success'; profiler: BrowserProfiler }
  | {
      status: 'error'
      reason: 'not-supported-by-browser' | 'missing-document-policy-header' | 'unexpected-exception'
    }

export function createBrowserProfiler(
  configuration: { sampleIntervalMs: number; collectIntervalMs: number },
  onBufferFull: () => void
): BrowserProfilerCreationResult {
  const profilerConstructor = globalObject.Profiler
  if (!profilerConstructor) {
    return { status: 'error', reason: 'not-supported-by-browser' }
  }

  let profiler: Profiler
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

  // eslint-disable-next-line local-rules/disallow-zone-js-patched-values -- FIXME use the `addEventListener` helper
  profiler.addEventListener('samplebufferfull', onBufferFull)

  return {
    status: 'success',
    profiler: {
      stop() {
        // eslint-disable-next-line local-rules/disallow-zone-js-patched-values -- FIXME use the `addEventListener` helper
        profiler.removeEventListener('samplebufferfull', onBufferFull)
        return profiler.stop()
      },
    },
  }
}
