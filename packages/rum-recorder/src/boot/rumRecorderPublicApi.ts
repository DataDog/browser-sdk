import { monitor } from '@datadog/browser-core'
import { makeRumPublicApi, StartRum } from '@datadog/browser-rum-core'

import { startRecording } from './recorder'

export type StartRecording = typeof startRecording

export function makeRumRecorderPublicApi(startRumImpl: StartRum, startRecordingImpl: StartRecording) {
  const rumRecorderGlobal = makeRumPublicApi((userConfiguration, getCommonContext) => {
    let isRecording = false

    const startRumResult = startRumImpl(userConfiguration, () => ({
      ...getCommonContext(),
      hasReplay: isRecording,
    }))

    const { lifeCycle, parentContexts, configuration, session } = startRumResult

    if (configuration.isEnabled('postpone_start_recording')) {
      ;(rumRecorderGlobal as any).startSessionRecord = monitor(startSessionRecord)
    } else {
      startSessionRecord()
    }

    function startSessionRecord() {
      if (isRecording) {
        return
      }

      isRecording = true
      startRecordingImpl(lifeCycle, userConfiguration.applicationId, configuration, session, parentContexts)
    }

    return startRumResult
  })
  return rumRecorderGlobal
}
