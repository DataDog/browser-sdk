import type { SessionManager } from '@datadog/browser-core'
import { DISCARDED, HookNames, SKIPPED } from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import { SessionReplayState, SessionType, computeSessionReplayState } from '../sessionReplayState'
import { RumEventType } from '../../rawRumEvent.types'
import type { RecorderApi } from '../../boot/rumPublicApi'
import type { DefaultRumEventAttributes, DefaultTelemetryEventAttributes, Hooks } from '../hooks'
import type { ViewHistory } from './viewHistory'

export function startSessionContext(
  hooks: Hooks,
  configuration: RumConfiguration,
  sessionManager: SessionManager,
  recorderApi: RecorderApi,
  viewHistory: ViewHistory
) {
  hooks.register(HookNames.Assemble, ({ eventType, startTime }): DefaultRumEventAttributes | DISCARDED => {
    const session = sessionManager.findTrackedSession(configuration.sessionSampleRate, startTime)
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

  hooks.register(HookNames.AssembleTelemetry, ({ startTime }): DefaultTelemetryEventAttributes | SKIPPED => {
    const session = sessionManager.findTrackedSession(configuration.sessionSampleRate, startTime)

    if (!session) {
      return SKIPPED
    }

    return {
      session: {
        id: session.id,
      },
    }
  })
}
