import { display } from '@datadog/browser-core'
import { globalObject } from '@datadog/js-core/util'
import type { Profiler } from '@datadog/js-core/util'
import type { ProfilerStartupErrorReason, RUMProfilerConfiguration } from './types'

export type ProfilerInstanceCreation =
  | { readonly state: 'created'; readonly profiler: Profiler }
  | { readonly state: 'error'; readonly errorReason: ProfilerStartupErrorReason }

/**
 * Creates a new Profiler instance with the given profiler configuration.
 *
 * Shared between the early profiler (main bundle) and the profiler chunk, so
 * both create instances with the same options and map startup errors the same
 * way.
 */
export function createProfilerInstance(profilerConfiguration: RUMProfilerConfiguration): ProfilerInstanceCreation {
  // This API might be unavailable in some browsers
  const profilerConstructor = globalObject.Profiler

  if (!profilerConstructor) {
    return { state: 'error', errorReason: 'not-supported-by-browser' }
  }

  try {
    // We have to create a new Profiler each time we start a new instance
    return {
      state: 'created',
      profiler: new profilerConstructor({
        sampleInterval: profilerConfiguration.sampleIntervalMs,
        // Keep buffer size at 1.5 times of minimum required to collect data for a profiling instance
        maxBufferSize: Math.round(
          (profilerConfiguration.collectIntervalMs * 1.5) / profilerConfiguration.sampleIntervalMs
        ),
      }),
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('disabled by Document Policy')) {
      // Missing Response Header (`js-profiling`) that is required to enable the profiler.
      // We should suggest the user to enable the Response Header in their server configuration.
      display.warn(
        '[DD_RUM] Profiler startup failed. Ensure your server includes the `Document-Policy: js-profiling` response header when serving HTML pages.',
        e
      )
      return { state: 'error', errorReason: 'missing-document-policy-header' }
    }
    return { state: 'error', errorReason: 'unexpected-exception' }
  }
}
