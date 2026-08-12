import type { SessionManager } from '@datadog/browser-core'
import { DISCARDED } from '@datadog/js-core/assembly'
import type { RumConfiguration } from '../configuration'
import { SessionReplayState, computeSessionReplayState } from '../sessionReplayState'
import { RumEventType } from '../../rawRumEvent.types'
import type { RecorderApi } from '../../boot/rumPublicApi'
import type { AssembleHook, DefaultRumEventAttributes } from '../hooks'
import type { ViewHistory } from './viewHistory'

export const enum SessionType {
  SYNTHETICS = 'synthetics',
  USER = 'user',
  CI_TEST = 'ci_test',
}

export function startSessionContext(
  assembleHook: AssembleHook,
  configuration: RumConfiguration,
  sessionManager: SessionManager,
  recorderApi: RecorderApi,
  viewHistory: ViewHistory
) {
  assembleHook.register(({ eventType, startTime }): DefaultRumEventAttributes | DISCARDED => {
    const session = sessionManager.findTrackedSession(startTime)
    const view = viewHistory.findView(startTime)

    if (!session || !view) {
      return DISCARDED
    }

    let hasReplay
    let sampledForReplay
    let isActive
    if (eventType === RumEventType.VIEW) {
      hasReplay = recorderApi.getReplayStats(view.id) ? true : undefined
      sampledForReplay = computeSessionReplayState(session, configuration) === SessionReplayState.SAMPLED
      isActive = view.sessionIsActive ? undefined : false
    } else {
      // KNOWN GAP (RUMS-6240): unlike the VIEW branch above, this is a live, one-shot read of
      // `isRecording()` with no retry or history. `isRecording()` requires the Deflate worker's
      // async init handshake to have fully completed (see recorderApi.ts), which is a strictly
      // later condition than the recorder actually starting to capture DOM mutations (`record()`
      // in datadogRecorder.ts only needs the worker instance to exist, not be initialized).
      // An error/action/resource firing in that window gets `has_replay: undefined` baked in
      // permanently, even if a segment covering that exact moment is captured moments later --
      // there is no mechanism (analogous to getReplayStats' history) to retroactively correct it.
      hasReplay = recorderApi.isRecording() ? true : undefined
    }

    return {
      type: eventType,
      session: {
        id: session.id,
        type: SessionType.USER,
        has_replay: hasReplay,
        sampled_for_replay: sampledForReplay,
        is_active: isActive,
      },
    }
  })
}
