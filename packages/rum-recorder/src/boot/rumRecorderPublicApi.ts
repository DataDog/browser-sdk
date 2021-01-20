import { makeRumPublicApi, StartRum } from '@datadog/browser-rum-core'

import { startRecording } from './recorder'

export type StartRecording = typeof startRecording

export function makeRumRecorderPublicApi(startRumImpl: StartRum, startRecordingImpl: StartRecording) {
  const rumRecorderGlobal = makeRumPublicApi((userConfiguration, getCommonContext) => {
    const startRumResult = startRumImpl(userConfiguration, () => ({
      ...getCommonContext(),
      hasReplay: true,
    }))

    const { lifeCycle, parentContexts, configuration, session } = startRumResult
    startRecordingImpl(lifeCycle, userConfiguration.applicationId, configuration, session, parentContexts)

    return startRumResult
  })
  return rumRecorderGlobal
}
