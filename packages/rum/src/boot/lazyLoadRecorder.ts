import { mockable } from '@datadog/browser-core'
import { reportScriptLoadingError } from '../domain/scriptLoadingError'
import type { startRecording } from './startRecording'

export async function lazyLoadRecorder(): Promise<typeof startRecording | undefined> {
  try {
    return await mockable(importRecorder)()
  } catch (error: unknown) {
    reportScriptLoadingError({
      error,
      source: 'Recorder',
      scriptType: 'module',
    })
  }
}

export async function importRecorder() {
  const module = await import(/* webpackChunkName: "recorder" */ './startRecording')
  return module.startRecording
}
