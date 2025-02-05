import { reportScriptLoadingError } from '../domain/scriptLoadingError'
import type { startRecording } from './startRecording'

export function lazyLoadRecorder() {
  return lazyLoadRecorderFrom(async () => {
    const module = await import(/* webpackChunkName: "recorder" */ './startRecording')
    return module.startRecording
  })
}

export async function lazyLoadRecorderFrom(
  importer: () => Promise<typeof startRecording>
): Promise<typeof startRecording | undefined> {
  try {
    return await importer()
  } catch (error: unknown) {
    reportScriptLoadingError({
      error,
      source: 'Recorder',
      scriptType: 'module',
    })
  }
}
