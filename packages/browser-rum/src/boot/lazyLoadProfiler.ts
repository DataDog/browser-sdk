import { mockable } from '@datadog/browser-core'
import { reportScriptLoadingError } from '../domain/scriptLoadingError'
import type { createRumProfiler, DEFAULT_RUM_PROFILER_CONFIGURATION } from '../domain/profiling/datadogProfiler'
import type { createWorkerProfilingCoordinator } from '../domain/profiling/workerProfilingCoordinator'

export interface LazyProfilerModule {
  createRumProfiler: typeof createRumProfiler
  createWorkerProfilingCoordinator: typeof createWorkerProfilingCoordinator
  DEFAULT_RUM_PROFILER_CONFIGURATION: typeof DEFAULT_RUM_PROFILER_CONFIGURATION
}

export async function lazyLoadProfiler(): Promise<LazyProfilerModule | undefined> {
  try {
    return await mockable(importProfiler)()
  } catch (error: unknown) {
    reportScriptLoadingError({
      error,
      source: 'Profiler',
      scriptType: 'module',
    })
  }
}

export async function importProfiler(): Promise<LazyProfilerModule> {
  const [profilerModule, coordinatorModule] = await Promise.all([
    import(/* webpackChunkName: "datadogProfiler" */ '../domain/profiling/datadogProfiler'),
    import(/* webpackChunkName: "datadogProfiler" */ '../domain/profiling/workerProfilingCoordinator'),
  ])
  return {
    createRumProfiler: profilerModule.createRumProfiler,
    createWorkerProfilingCoordinator: coordinatorModule.createWorkerProfilingCoordinator,
    DEFAULT_RUM_PROFILER_CONFIGURATION: profilerModule.DEFAULT_RUM_PROFILER_CONFIGURATION,
  }
}
