import { Configuration, monitor, noop, runOnReadyState, InternalMonitoring } from '@datadog/browser-core'
import {
  LifeCycleEventType,
  makeRumPublicApi,
  RumInitConfiguration,
  StartRum,
  CommonContext,
  RumSessionPlan,
} from '@datadog/browser-rum-core'

import { startRecording } from './startRecording'

export type StartRecording = typeof startRecording
export type RumRecorderPublicApi = ReturnType<typeof makeRumRecorderPublicApi>

export interface RumRecorderInitConfiguration extends RumInitConfiguration {
  manualSessionReplayRecordingStart?: boolean
}

/**
 * TODO: remove this type in the next major release
 * @deprecated Use RumRecorderInitConfiguration instead
 */
export type RumRecorderUserConfiguration = RumRecorderInitConfiguration

const enum RecorderStatus {
  Stopped,
  IntentToStart,
  Starting,
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
      if (session.getPlan() !== RumSessionPlan.REPLAY) {
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
