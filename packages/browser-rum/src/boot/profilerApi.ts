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
import { createBrowserProfiler, stopEarlyCollectionProfiler } from '../browser/browserProfiler'
import type { BrowserProfiler } from '../browser/browserProfiler'
import { DEFAULT_RUM_PROFILER_CONFIGURATION } from '../domain/profiling/profilingConfiguration'
import { startProfilingContext } from '../domain/profiling/profilingContext'
import { lazyLoadProfiler } from './lazyLoadProfiler'

export function makeProfilerApi(): ProfilerApi {
  let profiler: RUMProfiler | undefined
  let pendingBrowserProfiler: BrowserProfiler | undefined

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

    const result = createBrowserProfiler(DEFAULT_RUM_PROFILER_CONFIGURATION)
    if (result.status === 'error') {
      profilingContextManager.set({ status: 'error', error_reason: result.reason })
      return
    }
    pendingBrowserProfiler = result.profiler

    mockable(lazyLoadProfiler)()
      .then((createRumProfiler) => {
        if (!createRumProfiler) {
          profilingContextManager.set({ status: 'error', error_reason: 'failed-to-lazy-load' })
          stopPendingBrowserProfiler()
          return
        }

        // A stop during loading cancels startup and disposes the pending instance.
        if (!pendingBrowserProfiler) {
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
        profiler.start(pendingBrowserProfiler)
        pendingBrowserProfiler = undefined
      })
      .catch((e: unknown) => {
        stopPendingBrowserProfiler()
        monitorError(e)
      })
  }

  function stopPendingBrowserProfiler() {
    const browserProfiler = pendingBrowserProfiler
    pendingBrowserProfiler = undefined
    void browserProfiler?.stop().catch(monitorError)
  }

  return {
    onRumStart,
    stop: () => {
      profiler?.stop()
      stopPendingBrowserProfiler()
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
