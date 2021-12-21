import { canUseEventBridge, noop, runOnReadyState } from '@datadog/browser-core'
import {
  LifeCycleEventType,
  LifeCycle,
  ParentContexts,
  RumSessionManager,
  RecorderApi,
  RumConfiguration,
} from '@datadog/browser-rum-core'
import { getReplayStats } from '../domain/replayStats'
import { startDeflateWorker } from '../domain/segmentCollection/startDeflateWorker'

import { startRecording } from './startRecording'

export type StartRecording = typeof startRecording

const enum RecorderStatus {
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
type RecorderState =
  | {
      status: RecorderStatus.Stopped
    }
  | {
      status: RecorderStatus.IntentToStart
    }
  | {
      status: RecorderStatus.Starting
    }
  | {
      status: RecorderStatus.Started
      stopRecording: () => void
    }

export function makeRecorderApi(
  startRecordingImpl: StartRecording,
  startDeflateWorkerImpl = startDeflateWorker
): RecorderApi {
  if (canUseEventBridge()) {
    return {
      start: noop,
      stop: noop,
      getReplayStats: () => undefined,
      onRumStart: noop,
      isRecording: () => false,
    }
  }

  let state: RecorderState = {
    status: RecorderStatus.Stopped,
  }

  let startStrategy = () => {
    state = { status: RecorderStatus.IntentToStart }
  }
  let stopStrategy = () => {
    state = { status: RecorderStatus.Stopped }
  }
  return {
    start: () => startStrategy(),
    stop: () => stopStrategy(),
    getReplayStats,

    onRumStart: (
      lifeCycle: LifeCycle,
      configuration: RumConfiguration,
      sessionManager: RumSessionManager,
      parentContexts: ParentContexts
    ) => {
      lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, () => {
        if (state.status === RecorderStatus.Starting || state.status === RecorderStatus.Started) {
          stopStrategy()
          state = { status: RecorderStatus.IntentToStart }
        }
      })

      lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
        if (state.status === RecorderStatus.IntentToStart) {
          startStrategy()
        }
      })

      startStrategy = () => {
        const session = sessionManager.findTrackedSession()
        if (!session || !session.hasReplayPlan) {
          state = { status: RecorderStatus.IntentToStart }
          return
        }

        if (state.status === RecorderStatus.Starting || state.status === RecorderStatus.Started) {
          return
        }

        state = { status: RecorderStatus.Starting }

        runOnReadyState('interactive', () => {
          if (state.status !== RecorderStatus.Starting) {
            return
          }

          startDeflateWorkerImpl((worker) => {
            if (state.status !== RecorderStatus.Starting) {
              return
            }

            if (!worker) {
              state = {
                status: RecorderStatus.Stopped,
              }
              return
            }

            const { stop: stopRecording } = startRecordingImpl(
              lifeCycle,
              configuration,
              sessionManager,
              parentContexts,
              worker
            )
            state = {
              status: RecorderStatus.Started,
              stopRecording,
            }
          })
        })
      }

      stopStrategy = () => {
        if (state.status === RecorderStatus.Stopped) {
          return
        }

        if (state.status === RecorderStatus.Started) {
          state.stopRecording()
        }

        state = {
          status: RecorderStatus.Stopped,
        }
      }

      if (state.status === RecorderStatus.IntentToStart) {
        startStrategy()
      }
    },

    isRecording: () => state.status === RecorderStatus.Started,
  }
}
