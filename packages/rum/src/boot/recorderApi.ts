import { Configuration, monitor, noop, runOnReadyState } from '@datadog/browser-core'
import {
  LifeCycleEventType,
  RumInitConfiguration,
  LifeCycle,
  ParentContexts,
  RumSession,
  RecorderApi,
} from '@datadog/browser-rum-core'

import { startRecording } from './startRecording'

export type StartRecording = typeof startRecording

export interface RumRecorderInitConfiguration extends RumInitConfiguration {
  manualSessionReplayRecordingStart?: boolean
}

/**
 * TODO: remove this type in the next major release
 * @deprecated Use RumRecorderInitConfiguration instead
 */
export type RumRecorderUserConfiguration = RumRecorderInitConfiguration

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

export function makeRecorderApi(startRecordingImpl: StartRecording): RecorderApi {
  let state: RecorderState = {
    status: RecorderStatus.Stopped,
  }

  let onRumStartStrategy = (initConfiguration: RumRecorderInitConfiguration, configuration: Configuration) => {
    if (
      !initConfiguration.manualSessionReplayRecordingStart &&
      // TODO: remove this when no snippets without manualSessionReplayRecordingStart are served in
      // the Datadog app. See RUMF-886
      !configuration.isEnabled('postpone_start_recording')
    ) {
      startSessionReplayRecordingStrategy()
    }
  }
  let startSessionReplayRecordingStrategy = () => {
    onRumStartStrategy = () => startSessionReplayRecordingStrategy()
  }
  let stopSessionReplayRecordingStrategy = () => {
    onRumStartStrategy = noop
  }
  return {
    public: {
      startSessionReplayRecording: monitor(() => {
        startSessionReplayRecordingStrategy()
      }),
      stopSessionReplayRecording: monitor(() => {
        stopSessionReplayRecordingStrategy()
      }),
    },
    onRumStart: (
      lifeCycle: LifeCycle,
      initConfiguration: RumRecorderInitConfiguration,
      configuration: Configuration,
      session: RumSession,
      parentContexts: ParentContexts
    ) => {
      lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
        if (state.status === RecorderStatus.IntentToStart) {
          startSessionReplayRecordingStrategy()
        }
      })

      startSessionReplayRecordingStrategy = () => {
        if (!session.hasReplayPlan()) {
          state = { status: RecorderStatus.IntentToStart }
          return
        }

        if (state.status === RecorderStatus.Starting || state.status === RecorderStatus.Started) {
          return
        }

        state = { status: RecorderStatus.Starting }

        runOnReadyState('complete', () => {
          if (state.status !== RecorderStatus.Starting) {
            return
          }

          const { stop: stopRecording } = startRecordingImpl(
            lifeCycle,
            initConfiguration.applicationId,
            configuration,
            session,
            parentContexts
          )
          state = {
            status: RecorderStatus.Started,
            stopRecording,
          }
          lifeCycle.notify(LifeCycleEventType.RECORD_STARTED)
        })
      }

      stopSessionReplayRecordingStrategy = () => {
        if (state.status === RecorderStatus.Stopped) {
          return
        }

        if (state.status === RecorderStatus.Started) {
          state.stopRecording()
        }

        state = {
          status: RecorderStatus.Stopped,
        }
        lifeCycle.notify(LifeCycleEventType.RECORD_STOPPED)
      }

      onRumStartStrategy(initConfiguration, configuration)
    },

    isRecording: () => state.status === RecorderStatus.Started,
  }
}
