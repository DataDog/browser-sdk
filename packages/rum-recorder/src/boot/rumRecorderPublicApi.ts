import { monitor } from '@datadog/browser-core'
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
  const rumRecorderGlobal = makeRumPublicApi<RumRecorderUserConfiguration>((userConfiguration, getCommonContext) => {
    let state: RecorderState = {
      status: RecorderStatus.Stopped,
    }

    const startRumResult = startRumImpl(userConfiguration, () => ({
      ...getCommonContext(),
      hasReplay: state.status === RecorderStatus.Started ? true : undefined,
    }))

    const { lifeCycle, parentContexts, configuration, session } = startRumResult

    if (configuration.isEnabled('postpone_start_recording')) {
      ;(rumRecorderGlobal as any).startSessionReplayRecording = monitor(startSessionReplayRecording)
      ;(rumRecorderGlobal as any).stopSessionReplayRecording = monitor(stopSessionReplayRecording)
    }

    if (!userConfiguration.manualSessionReplayRecordingStart) {
      startSessionReplayRecording()
    }

    function startSessionReplayRecording() {
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

    function stopSessionReplayRecording() {
      if (state.status !== RecorderStatus.Started) {
        return
      }

      state.stopRecording()
      state = {
        status: RecorderStatus.Stopped,
      }
      lifeCycle.notify(LifeCycleEventType.RECORD_STOPPED)
    }

    return startRumResult
  })
  return rumRecorderGlobal
}
