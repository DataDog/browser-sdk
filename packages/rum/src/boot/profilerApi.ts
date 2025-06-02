import type {
  LifeCycle,
  ViewHistory,
  RumSessionManager,
  RumConfiguration,
  ProfilerApi,
} from '@datadog/browser-rum-core'
import {
  addTelemetryDebug,
  ExperimentalFeature,
  isExperimentalFeatureEnabled,
  monitorError,
  performDraw,
} from '@datadog/browser-core'
import type { RUMProfiler } from '../domain/profiling/types'
import { isProfilingSupported } from '../domain/profiling/profilingSupported'
import { createProfilingStatusManager } from '../domain/profiling/profilingStatusManager'
import { lazyLoadProfiler } from './lazyLoadProfiler'

export function makeProfilerApi(): ProfilerApi {
  let profiler: RUMProfiler | undefined
  const profilingStatusManager = createProfilingStatusManager('initializing')

  function onRumStart(
    lifeCycle: LifeCycle,
    configuration: RumConfiguration,
    sessionManager: RumSessionManager,
    viewHistory: ViewHistory
  ) {
    if (!isExperimentalFeatureEnabled(ExperimentalFeature.PROFILING)) {
      profilingStatusManager.setProfilingStatus('missing-profiling-experimental-feature')
      return
    }

    const hasSupportForProfiler = isProfilingSupported()
    if (!hasSupportForProfiler || !performDraw(configuration.profilingSampleRate)) {
      // Update Profiling status to indicate that the Profiler was not started with the reason.
      profilingStatusManager.setProfilingStatus(hasSupportForProfiler ? 'not-sampled' : 'not-supported-by-browser')
      return
    }

    lazyLoadProfiler()
      .then((createRumProfiler) => {
        if (!createRumProfiler) {
          addTelemetryDebug('[DD_RUM] Failed to lazy load the RUM Profiler')
          profilingStatusManager.setProfilingStatus('failed-to-lazy-load')
          return
        }

        profiler = createRumProfiler(configuration, lifeCycle, sessionManager, profilingStatusManager)
        profiler.start(viewHistory.findView())
      })
      .catch(monitorError)
  }

  return {
    onRumStart,
    stop: () => {
      profiler?.stop().catch(monitorError)
    },
    getProfilingStatus: profilingStatusManager.getProfilingStatus,
  }
}
