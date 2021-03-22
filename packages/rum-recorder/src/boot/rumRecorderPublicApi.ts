import { monitor } from '@datadog/browser-core'
import { LifeCycleEventType, makeRumPublicApi, StartRum } from '@datadog/browser-rum-core'

import { startRecording } from './recorder'

export type StartRecording = typeof startRecording

export function makeRumRecorderPublicApi(startRumImpl: StartRum, startRecordingImpl: StartRecording) {
  const rumRecorderGlobal = makeRumPublicApi((userConfiguration, getCommonContext) => {
    let stopRecording: (() => void) | undefined

    const startRumResult = startRumImpl(userConfiguration, () => ({
      ...getCommonContext(),
      hasReplay: stopRecording ? true : undefined,
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
      if (stopRecording) {
        return
      }
      ;({ stop: stopRecording } = startRecordingImpl(
        lifeCycle,
        userConfiguration.applicationId,
        configuration,
        session,
        parentContexts
      ))
      lifeCycle.notify(LifeCycleEventType.RECORD_STARTED)
    }

    function stopSessionReplayRecording() {
      if (!stopRecording) {
        return
      }

      stopRecording()
      stopRecording = undefined
      lifeCycle.notify(LifeCycleEventType.RECORD_STOPPED)
    }

    return startRumResult
  })
  return rumRecorderGlobal
}
