import {
  SessionReplayState,
  type LifeCycle,
  type RumConfiguration,
  type RumSessionManager,
  type StartRecordingOptions,
  type ViewHistory,
} from '@datadog/browser-rum-core'
import { runOnReadyState, type DeflateEncoder } from '@datadog/browser-core'
import { getSessionReplayLink } from '../domain/getSessionReplayLink'
import type { startRecording } from './startRecording'

export type StartRecording = typeof startRecording

export const enum RecorderStatus {
  // The recorder is stopped.
  Stopped,
  // The user started the recording while it wasn't possible yet. The recorder should start as soon
  // as possible.
  IntentToStart,
  // The recorder is starting. It does not record anything yet.
  Starting,
  // The recorder is started, it records the session.
  Started,
}
export type RecorderState = {
  status: RecorderStatus
  setStatus: (status: RecorderStatus) => void
  statusEqual: (status: RecorderStatus) => boolean
}

export interface Strategy {
  startStrategy: (options?: StartRecordingOptions) => void
  stopStrategy: () => void
  getSessionReplayLinkStrategy: () => string | undefined
}

export function createPostStartStrategy(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  sessionManager: RumSessionManager,
  viewHistory: ViewHistory,
  startRecordingImpl: StartRecording,
  getOrCreateDeflateEncoder: () => DeflateEncoder | undefined,
  state: RecorderState
): Strategy {
  let stopRecording: () => void
  return {
    startStrategy(options?: StartRecordingOptions) {
      const session = sessionManager.findTrackedSession()
      if (!session || (session.sessionReplay === SessionReplayState.OFF && (!options || !options.force))) {
        state.setStatus(RecorderStatus.IntentToStart)
        return
      }

      if (state.statusEqual(RecorderStatus.Starting) || state.statusEqual(RecorderStatus.Started)) {
        return
      }

      state.setStatus(RecorderStatus.Starting)

      runOnReadyState(configuration, 'interactive', () => {
        if (state.status !== RecorderStatus.Starting) {
          return
        }

        const deflateEncoder = getOrCreateDeflateEncoder()
        if (!deflateEncoder) {
          state.setStatus(RecorderStatus.Stopped)
          return
        }

        ;({ stop: stopRecording } = startRecordingImpl(
          lifeCycle,
          configuration,
          sessionManager,
          viewHistory,
          deflateEncoder
        ))

        state.setStatus(RecorderStatus.Started)
      })

      if (options && options.force && session.sessionReplay === SessionReplayState.OFF) {
        sessionManager.setForcedReplay()
      }
    },

    stopStrategy() {
      if (state.statusEqual(RecorderStatus.Stopped)) {
        return
      }

      stopRecording?.()

      state.setStatus(RecorderStatus.Stopped)
    },

    getSessionReplayLinkStrategy() {
      return getSessionReplayLink(configuration, sessionManager, viewHistory, state.status !== RecorderStatus.Stopped)
    },
  }
}
