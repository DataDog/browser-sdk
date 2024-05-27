import type { RecorderApi } from '@datadog/browser-rum-core'
import { noop } from '@datadog/browser-core'

export const noopRecorderApi: RecorderApi = {
  start: noop,
  stop: noop,
  onRumStart: noop,
  isRecording: () => false,
  getReplayStats: () => undefined,
  getSessionReplayLink: () => undefined,
}
