import { runOnReadyState } from '@datadog/browser-core'
import type {
  LifeCycle,
  ViewContexts,
  RumSessionManager,
  RecorderApi,
  RumConfiguration,
} from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import { getReplayStats } from '../domain/replayStats'
import { startDeflateWorker } from '../domain/segmentCollection'
import type { DeflateWorker } from '../domain/segmentCollection'

import type { startRecording } from './startRecording'

import { initRecorderStateMachine, RecorderStatus } from './recorderStateMachine'

export type StartRecording = typeof startRecording

export function makeRecorderApi(
  startRecordingImpl: StartRecording,
  startDeflateWorkerImpl = startDeflateWorker
): RecorderApi {
  const service = initRecorderStateMachine()
  let removeInteractiveEventListener: (() => void) | undefined

  function onRumStart(
    lifeCycle: LifeCycle,
    configuration: RumConfiguration,
    sessionManager: RumSessionManager,
    viewContexts: ViewContexts
  ) {
    service.send({ type: 'INIT', sessionManager })

    lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, () => {
      service.send({ type: 'RESET_RECORDER' })
    })
    lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
      service.send({ type: 'ATTEMPT_START' })
    })

    service.subscribe((state) => {
      if (!state.changed) return // avoid infinite loops by only listening to changed events

      if (state.value === RecorderStatus.IntendToStart) {
        service.send({ type: 'ATTEMPT_START' })
      }

      if (state.value === RecorderStatus.ListeningForInteractive) {
        removeInteractiveEventListener = runOnReadyState('interactive', () => {
          service.send({ type: 'PAGE_INTERACTIVE' })
        })
      }

      if (state.value === RecorderStatus.ListeningForWorker) {
        startDeflateWorkerImpl((worker) => {
          service.send({ type: 'DEFLATE_WORKER_CALLED', worker })
        })
      }

      if (state.value === RecorderStatus.Starting) {
        const { stop: stopRecording } = startRecordingImpl(
          lifeCycle,
          configuration,
          sessionManager,
          viewContexts,
          state.context.worker as DeflateWorker
        )
        service.send({ type: 'START_RECORDING', stopRecording })
      }

      // Clear listeners on Stopped
      if (state.value === RecorderStatus.Stopped && removeInteractiveEventListener) {
        removeInteractiveEventListener()
        removeInteractiveEventListener = undefined
      }
    })
  }

  function start() {
    service.send({ type: 'INTEND_TO_START' })
  }

  function stop() {
    service.send({ type: 'STOP' })
  }

  return {
    start,
    stop,
    getReplayStats,
    onRumStart,
    isRecording: () => service.state.value === RecorderStatus.Started,
  }
}
