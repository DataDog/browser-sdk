import type { ContextValue } from '@datadog/browser-core'
import {
  DISCARDED,
  HookNames,
  SKIPPED,
  dateNow,
  ONE_MINUTE,
  addTelemetryDebug,
  elapsed,
  relativeNow,
} from '@datadog/browser-core'
import type { RumSessionManager } from '../rumSessionManager'
import { SessionReplayState, SessionType } from '../rumSessionManager'
import { RumEventType } from '../../rawRumEvent.types'
import type { RecorderApi } from '../../boot/rumPublicApi'
import type { DefaultRumEventAttributes, DefaultTelemetryEventAttributes, Hooks } from '../hooks'
import type { ViewHistory } from './viewHistory'
import type { PageStateHistory } from './pageStateHistory'

export function startSessionContext(
  hooks: Hooks,
  sessionManager: RumSessionManager,
  recorderApi: RecorderApi,
  viewHistory: ViewHistory,
  pageStateHistory: PageStateHistory
) {
  hooks.register(HookNames.Assemble, ({ eventType, startTime }): DefaultRumEventAttributes | DISCARDED => {
    const session = sessionManager.findTrackedSession(startTime)
    const view = viewHistory.findView(startTime)

    if (!session || !view) {
      return DISCARDED
    }
    if (session.expire && dateNow() - Number(session.expire) > ONE_MINUTE) {
      const duration = elapsed(startTime, relativeNow())
      // monitor-until: 2026-01-01
      addTelemetryDebug('Event sent after session expiration', {
        debug: {
          duration,
          eventType,
          expired_since: dateNow() - Number(session.expire),
          page_state: pageStateHistory.findPageStatesForPeriod(startTime, duration) as ContextValue,
        },
      })
    }

    let hasReplay
    let sampledForReplay
    let isActive
    if (eventType === RumEventType.VIEW) {
      hasReplay = recorderApi.getReplayStats(view.id) ? true : undefined
      sampledForReplay = session.sessionReplay === SessionReplayState.SAMPLED
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
    const session = sessionManager.findTrackedSession(startTime)

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
