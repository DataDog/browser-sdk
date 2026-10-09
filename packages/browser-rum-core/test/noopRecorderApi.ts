import { noop } from '@datadog/js-core/util'
import type { RecorderApi } from '@datadog/browser-rum-core'

export const noopRecorderApi: RecorderApi = {
  start: noop,
  stop: noop,
  isRecording: () => false,
  onRumStart: noop,
  getReplayStats: () => undefined,
  getSessionReplayLink: () => undefined,
}
