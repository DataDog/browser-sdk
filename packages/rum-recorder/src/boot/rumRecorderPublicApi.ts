import { Configuration, monitor, noop, runOnReadyState, InternalMonitoring } from '@datadog/browser-core'
import {
  LifeCycleEventType,
  makeRumPublicApi,
  RumInitConfiguration,
  StartRum,
  CommonContext,
} from '@datadog/browser-rum-core'

import { startRecording } from './startRecording'

export type StartRecording = typeof startRecording
export type RumRecorderPublicApi = ReturnType<typeof makeRumRecorderPublicApi>

export interface RumRecorderInitConfiguration extends RumInitConfiguration {
  manualSessionReplayRecordingStart?: boolean
}

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

export function makeRumRecorderPublicApi(startRumImpl: StartRum, startRecordingImpl: StartRecording) {
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

  function startRumRecorder(
    initConfiguration: RumRecorderInitConfiguration,
    configuration: Configuration,
    internalMonitoring: InternalMonitoring,
    getCommonContext: () => CommonContext,
    initialViewName?: string
  ) {
    let state: RecorderState = {
      status: RecorderStatus.Stopped,
    }

    const startRumResult = startRumImpl(
      initConfiguration,
      configuration,
      internalMonitoring,
      () => ({
        ...getCommonContext(),
        hasReplay: state.status === RecorderStatus.Started ? true : undefined,
      }),
      initialViewName
    )

    const { lifeCycle, parentContexts, session } = startRumResult

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

    return startRumResult
  }

  const rumPublicApi = makeRumPublicApi<RumRecorderInitConfiguration>(startRumRecorder)

  const rumRecorderPublicApi = {
    ...rumPublicApi,
    startSessionReplayRecording: monitor(() => {
      startSessionReplayRecordingStrategy()
    }),
    stopSessionReplayRecording: monitor(() => {
      stopSessionReplayRecordingStrategy()
    }),
  }
  return rumRecorderPublicApi
}
