import type { Hooks, LifeCycle, ProfilerApi, RumConfiguration, ViewHistory } from '@datadog/browser-rum-core'
import type { DeflateEncoderStreamId, Encoder, SessionContext, SessionManager } from '@datadog/browser-core'
import {
  BridgeCapability,
  bridgeSupports,
  canUseEventBridge,
  correctedChildSampleRate,
  isSampled,
} from '@datadog/browser-core'
import { mockable } from '@datadog/js-core/util'
import { monitorError } from '@datadog/js-core/monitor'
import type { RUMProfiler } from '../domain/profiling/types'
import { stopEarlyCollectionProfiler } from '../domain/profiling/earlyCollectionProfiler'
import { isProfilingSupported } from '../domain/profiling/profilingSupported'
import { startProfilingContext } from '../domain/profiling/profilingContext'
import { lazyLoadProfiler } from './lazyLoadProfiler'

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
      stopEarlyCollectionProfiler()
      return
    }

    if (!isProfilingSampled(configuration, session)) {
      stopEarlyCollectionProfiler()
      return
    }

    // Listen to events and add the profiling context to them.
    const profilingContextManager = startProfilingContext(hooks)

    // Browser support check. This also avoids downloading the profiler chunk
    // on browsers that don't support the Profiler API. Other startup errors
    // (e.g. missing `Document-Policy: js-profiling` header) are only detectable
    // when constructing a Profiler instance, and are handled by the chunk.
    if (!mockable(isProfilingSupported)()) {
      profilingContextManager.set({
        status: 'error',
        error_reason: 'not-supported-by-browser',
      })
      stopEarlyCollectionProfiler()
      return
    }

    mockable(lazyLoadProfiler)()
      .then((createRumProfiler) => {
        if (!createRumProfiler) {
          profilingContextManager.set({ status: 'error', error_reason: 'failed-to-lazy-load' })
          stopEarlyCollectionProfiler()
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
        stopEarlyCollectionProfiler()
        monitorError(e)
      })
  }

  return {
    onRumStart,
    stop: () => {
      profiler?.stop()
      // In case the profiler chunk has not been loaded yet, also stop the
      // Profiler instance started by the early collection package. When the
      // chunk has already adopted it, this is a no-op (adoption clears the
      // takeover state).
      stopEarlyCollectionProfiler()
    },
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
