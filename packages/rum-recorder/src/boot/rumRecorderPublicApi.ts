import { Configuration, monitor, noop, runOnReadyState, InternalMonitoring } from '@datadog/browser-core'
import {
  LifeCycleEventType,
  makeRumPublicApi,
  RumUserConfiguration,
  StartRum,
  CommonContext,
} from '@datadog/browser-rum-core'

import { startRecording } from './recorder'

export type StartRecording = typeof startRecording
export type RumRecorderPublicApi = ReturnType<typeof makeRumRecorderPublicApi>

export interface RumRecorderUserConfiguration extends RumUserConfiguration {
  manualSessionReplayRecordingStart?: boolean
}

const enum RecorderStatus {
  Stopped,
  Starting,
  Started,
}
type RecorderState =
  | {
      status: RecorderStatus.Stopped
    }
  | {
      status: RecorderStatus.Starting
    }
  | {
      status: RecorderStatus.Started
      stopRecording: () => void
    }

export function makeRumRecorderPublicApi(startRumImpl: StartRum, startRecordingImpl: StartRecording) {
  let onRumStartStrategy = (userConfiguration: RumRecorderUserConfiguration, configuration: Configuration) => {
    if (
      !userConfiguration.manualSessionReplayRecordingStart &&
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
    userConfiguration: RumRecorderUserConfiguration,
    configuration: Configuration,
    internalMonitoring: InternalMonitoring,
    getCommonContext: () => CommonContext,
    initialViewName?: string
  ) {
    let state: RecorderState = {
      status: RecorderStatus.Stopped,
    }

    const startRumResult = startRumImpl(
      userConfiguration,
      configuration,
      internalMonitoring,
      () => ({
        ...getCommonContext(),
        hasReplay: state.status === RecorderStatus.Started ? true : undefined,
      }),
      initialViewName
    )

    const { lifeCycle, parentContexts, session } = startRumResult

    startSessionReplayRecordingStrategy = () => {
      if (state.status !== RecorderStatus.Stopped) {
        return
      }

      state = { status: RecorderStatus.Starting }

      runOnReadyState('complete', () => {
        if (state.status !== RecorderStatus.Starting) {
          return
        }

        const { stop: stopRecording } = startRecordingImpl(
          lifeCycle,
          userConfiguration.applicationId,
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

    onRumStartStrategy(userConfiguration, configuration)

    return startRumResult
  }

  const rumPublicApi = makeRumPublicApi<RumRecorderUserConfiguration>(startRumRecorder)

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
