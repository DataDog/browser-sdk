import type { RecorderApi } from '@flashcatcloud/browser-rum-core'
import { noop } from '@flashcatcloud/browser-core'

export const noopRecorderApi: RecorderApi = {
  start: noop,
  stop: noop,
  isRecording: () => false,
  onRumStart: noop,
  getReplayStats: () => undefined,
  getSessionReplayLink: () => undefined,
}
