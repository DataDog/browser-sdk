import { Configuration, monitor, noop } from '@datadog/browser-core'
import { LifeCycleEventType, makeRumPublicApi, RumUserConfiguration, StartRum } from '@datadog/browser-rum-core'

import { startRecording } from './recorder'

export type StartRecording = typeof startRecording
export type RumRecorderPublicApi = ReturnType<typeof makeRumRecorderPublicApi>

export interface RumRecorderUserConfiguration extends RumUserConfiguration {
  manualSessionReplayRecordingStart?: boolean
}

const enum RecorderStatus {
  Stopped,
  Started,
}
type RecorderState =
  | {
      status: RecorderStatus.Stopped
    }
  | {
      status: RecorderStatus.Started
      stopRecording: () => void
    }

export function makeRumRecorderPublicApi(startRumImpl: StartRum, startRecordingImpl: StartRecording) {
  const rumPublicApi = makeRumPublicApi<RumRecorderUserConfiguration>((userConfiguration, getCommonContext) => {
    let state: RecorderState = {
      status: RecorderStatus.Stopped,
    }

    const startRumResult = startRumImpl(userConfiguration, () => ({
      ...getCommonContext(),
      hasReplay: state.status === RecorderStatus.Started ? true : undefined,
    }))

    const { lifeCycle, parentContexts, configuration, session } = startRumResult

    startSessionReplayRecordingImpl = () => {
      if (state.status === RecorderStatus.Started) {
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
    }

    stopSessionReplayRecordingImpl = () => {
      if (state.status !== RecorderStatus.Started) {
        return
      }

      state.stopRecording()
      state = {
        status: RecorderStatus.Stopped,
      }
      lifeCycle.notify(LifeCycleEventType.RECORD_STOPPED)
    }

    onInit(userConfiguration, configuration)

    return startRumResult
  })

  let onInit = (userConfiguration: RumRecorderUserConfiguration, configuration: Configuration) => {
    if (
      !userConfiguration.manualSessionReplayRecordingStart &&
      // TODO: remove this when no snippets without manualSessionReplayRecordingStart are served in
      // the Datadog app. See RUMF-886
      !configuration.isEnabled('postpone_start_recording')
    ) {
      startSessionReplayRecordingImpl()
    }
  }

  let startSessionReplayRecordingImpl = () => {
    onInit = () => startSessionReplayRecordingImpl()
  }

  let stopSessionReplayRecordingImpl = () => {
    onInit = noop
  }

  const rumRecorderPublicApi = {
    ...rumPublicApi,
    startSessionReplayRecording: monitor(() => {
      startSessionReplayRecordingImpl()
    }),
    stopSessionReplayRecording: monitor(() => {
      stopSessionReplayRecordingImpl()
    }),
  }
  return rumRecorderPublicApi
}
