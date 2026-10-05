import type { Hooks, LifeCycle, ProfilerApi, RumConfiguration, ViewHistory } from '@datadog/browser-rum-core'
import type { DeflateEncoderStreamId, Encoder, SessionContext, SessionManager } from '@datadog/browser-core'
import {
  BridgeCapability,
  bridgeSupports,
  canUseEventBridge,
  correctedChildSampleRate,
  isSampled,
  mockable,
} from '@datadog/browser-core'
import { monitorError } from '@datadog/js-core/monitor'
import { globalObject } from '@datadog/js-core/util'
import type { RUMProfiler } from '../domain/profiling/types'
import { EARLY_PROFILER_GLOBAL_NAME } from '../domain/profiling/earlyProfilerConstants'
import { isProfilingSupported } from '../domain/profiling/profilingSupported'
import { startProfilingContext } from '../domain/profiling/profilingContext'
import { lazyLoadProfiler } from './lazyLoadProfiler'

/** Type of the `window` global set by the early profiler snippet. */
interface EarlyProfilerGlobal {
  [EARLY_PROFILER_GLOBAL_NAME]?: unknown
}

export function makeProfilerApi(): ProfilerApi {
  let profiler: RUMProfiler | undefined

  function onRumStart(
    lifeCycle: LifeCycle,
    hooks: Hooks,
    configuration: RumConfiguration,
    sessionManager: SessionManager,
    viewHistory: ViewHistory,
    createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
  ) {
    const session = sessionManager.findTrackedSession() // Check if the session is tracked.

    if (!session) {
      // No session tracked, no profiling.
      // Note: No Profiling context is set at this stage.
      stopEarlyProfilerSnippet()
      return
    }

    if (!isProfilingSampled(configuration, session)) {
      stopEarlyProfilerSnippet()
      return
    }

    // Listen to events and add the profiling context to them.
    const profilingContextManager = startProfilingContext(hooks)

    // Browser support check. This also avoids downloading the profiler chunk
    // on browsers that don't support the Profiler API. Other startup errors
    // (e.g. missing `Document-Policy: js-profiling` header) are only detectable
    // when constructing a Profiler instance, and are handled by the chunk.
    if (!mockable(isProfilingSupported)()) {
      profilingContextManager.set({ status: 'error', error_reason: 'not-supported-by-browser' })
      stopEarlyProfilerSnippet()
      return
    }

    mockable(lazyLoadProfiler)()
      .then((createRumProfiler) => {
        if (!createRumProfiler) {
          profilingContextManager.set({ status: 'error', error_reason: 'failed-to-lazy-load' })
          stopEarlyProfilerSnippet()
          return
        }

        profiler = createRumProfiler(
          configuration,
          lifeCycle,
          sessionManager,
          profilingContextManager,
          createEncoder,
          viewHistory
        )
        profiler.start()
      })
      .catch((e: unknown) => {
        stopEarlyProfilerSnippet()
        monitorError(e)
      })
  }

  return {
    onRumStart,
    stop: () => {
      profiler?.stop()
      // In case the profiler chunk has not been loaded yet, also stop the
      // Profiler instance started by the early profiler snippet. When the chunk
      // has already taken it over, this is a no-op (the chunk deletes the
      // snippet global when adopting the instance).
      stopEarlyProfilerSnippet()
    },
  }
}

/**
 * Stops the Profiler instance started by the early profiler snippet, if any,
 * and discards its samples.
 *
 * The SDK is the only party that knows whether profiling will happen (session
 * and sampling decisions), so it is responsible for stopping the snippet's
 * Profiler when it won't: otherwise its samples would stay pinned in memory
 * until the page is unloaded. The samples cannot be sent without the profiler
 * chunk anyway.
 *
 * Everything else related to the early profiler snippet (validating it,
 * adopting the Profiler instance, collecting it periodically) is handled by
 * the profiler chunk.
 */
function stopEarlyProfilerSnippet() {
  const rawGlobal = (globalObject as EarlyProfilerGlobal)[EARLY_PROFILER_GLOBAL_NAME]
  delete (globalObject as EarlyProfilerGlobal)[EARLY_PROFILER_GLOBAL_NAME]
  if (typeof rawGlobal !== 'object' || rawGlobal === null) {
    return
  }
  const { profiler } = rawGlobal as { readonly profiler?: { stopped: unknown; stop: () => Promise<unknown> } }
  if (profiler && profiler.stopped !== true && typeof profiler.stop === 'function') {
    void profiler.stop().catch(monitorError)
  }
}

function isProfilingSampled(configuration: RumConfiguration, session: SessionContext) {
  if (canUseEventBridge()) {
    // In bridge mode, native SDK owns the sampling decision, skip the rate check
    return bridgeSupports(BridgeCapability.PROFILES)
  }
  return isSampled(
    session.id,
    correctedChildSampleRate(configuration.sessionSampleRate, configuration.profilingSampleRate)
  )
}
