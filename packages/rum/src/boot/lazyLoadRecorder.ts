import { reportScriptLoadingError } from '../domain/scriptLoadingError'
import type { startRecording } from './startRecording'

export async function lazyLoadRecorder(
  importRecorderImpl = importRecorder
): Promise<typeof startRecording | undefined> {
  try {
    return await importRecorderImpl()
  } catch (error: unknown) {
    reportScriptLoadingError({
      error,
      source: 'Recorder',
      scriptType: 'module',
    })
  }
}

async function importRecorder() {
  const module = await import(/* webpackChunkName: "datadog-recorder" */ './startRecording')
  return module.startRecording
}
