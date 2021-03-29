import { monitor } from '@datadog/browser-core'
import { LifeCycleEventType, makeRumPublicApi, StartRum } from '@datadog/browser-rum-core'

import { startRecording } from './recorder'

export type StartRecording = typeof startRecording

const enum StateType {
  Init,
  Recording,
}
type State = { type: StateType.Init } | { type: StateType.Recording; stopRecording: () => void }

export function makeRumRecorderPublicApi(startRumImpl: StartRum, startRecordingImpl: StartRecording) {
  const rumRecorderGlobal = makeRumPublicApi((userConfiguration, getCommonContext) => {
    let state: State = {
      type: StateType.Init,
    }

    const startRumResult = startRumImpl(userConfiguration, () => ({
      ...getCommonContext(),
      hasReplay: state.type === StateType.Recording ? true : undefined,
    }))

    const { lifeCycle, parentContexts, configuration, session } = startRumResult

    if (configuration.isEnabled('postpone_start_recording')) {
      ;(rumRecorderGlobal as any).startSessionReplayRecording = monitor(startSessionReplayRecording)
      ;(rumRecorderGlobal as any).stopSessionReplayRecording = monitor(stopSessionReplayRecording)
      if (!(userConfiguration as any).manualSessionReplayRecordingStart) {
        startSessionReplayRecording()
      }
    } else {
      startSessionReplayRecording()
    }

    function startSessionReplayRecording() {
      if (state.type === StateType.Recording) {
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
        type: StateType.Recording,
        stopRecording,
      }
      lifeCycle.notify(LifeCycleEventType.RECORD_STARTED)
    }

    function stopSessionReplayRecording() {
      if (state.type !== StateType.Recording) {
        return
      }

      state.stopRecording()
      state = {
        type: StateType.Init,
      }
      lifeCycle.notify(LifeCycleEventType.RECORD_STOPPED)
    }

    return startRumResult
  })
  return rumRecorderGlobal
}
