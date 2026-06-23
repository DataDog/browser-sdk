import { noop } from '@openobserve/browser-core'
import type { RecorderApi } from '@openobserve/browser-rum-core'

export const noopRecorderApi: RecorderApi = {
  start: noop,
  stop: noop,
  isRecording: () => false,
  onRumStart: noop,
  getReplayStats: () => undefined,
  getSessionReplayLink: () => undefined,
}
