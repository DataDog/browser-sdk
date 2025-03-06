export async function lazyLoadRecorder() {
  try {
    const module = await import(/* webpackChunkName: "datadog-recorder" */ './startRecording')
    return module.startRecording
  } catch {
    /* Prevent collecting the webpack ChunkLoadError as it is already collected as a RUM resource. */
  }
}
