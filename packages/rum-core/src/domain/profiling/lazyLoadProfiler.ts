export async function lazyLoadProfiler() {
  try {
    const module = await import('./datadogProfiler')
    return module.createRumProfiler
  } catch {
    /* Prevent collecting the webpack ChunkLoadError as it is already collected as a RUM resource. */
  }
}
