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
