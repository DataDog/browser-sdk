import { display } from '@datadog/browser-core'

export async function lazyLoadProfiler() {
  try {
    const module = await import(/* webpackChunkName: "profiler" */ './profiler')
    return module.createRumProfiler
  } catch (err) {
    /* Prevent collecting the webpack ChunkLoadError as it is already collected as a RUM resource. */

    display.error('[DD_RUM] Failed to load createRumProfiler', err)
  }
}
