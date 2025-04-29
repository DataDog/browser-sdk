import { reportScriptLoadingError } from '../domain/scriptLoadingError'
import type { createRumProfiler } from '../domain/profiling/profiler'

export async function lazyLoadProfiler(
  importProfilerImpl = importProfiler
): Promise<typeof createRumProfiler | undefined> {
  try {
    return await importProfilerImpl()
  } catch (error: unknown) {
    reportScriptLoadingError({
      error,
      source: 'Profiler',
      scriptType: 'module',
    })
  }
}

async function importProfiler() {
  const module = await import(/* webpackChunkName: "profiler" */ '../domain/profiling/profiler')
  return module.createRumProfiler
}
