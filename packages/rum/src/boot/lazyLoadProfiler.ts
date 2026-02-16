import { mockable } from '@datadog/browser-core'
import { reportScriptLoadingError } from '../domain/scriptLoadingError'
import type { createRumProfiler } from '../domain/profiling/profiler'

export async function lazyLoadProfiler(): Promise<typeof createRumProfiler | undefined> {
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

export async function importProfiler() {
  const module = await import(/* webpackChunkName: "profiler" */ '../domain/profiling/profiler')
  return module.createRumProfiler
}
