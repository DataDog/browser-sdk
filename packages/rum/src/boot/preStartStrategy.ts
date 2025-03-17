import { noop } from '@flashcatcloud/browser-core'
import type { RumConfiguration } from '@flashcatcloud/browser-rum-core'
import type { Strategy } from './postStartStrategy'

const enum PreStartRecorderStatus {
  None,
  HadManualStart,
  HadManualStop,
}

export function createPreStartStrategy(): {
  strategy: Strategy
  shouldStartImmediately: (configuration: RumConfiguration) => boolean
} {
  let status = PreStartRecorderStatus.None
  return {
    strategy: {
      start() {
        status = PreStartRecorderStatus.HadManualStart
      },
      stop() {
        status = PreStartRecorderStatus.HadManualStop
      },
      isRecording: () => false,
      getSessionReplayLink: noop as () => string | undefined,
    },
    shouldStartImmediately(configuration) {
      return (
        status === PreStartRecorderStatus.HadManualStart ||
        (status === PreStartRecorderStatus.None && !configuration.startSessionReplayRecordingManually)
      )
    },
  }
}
