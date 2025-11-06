import type { ContextValue } from '@datadog/browser-core'
import {
  toServerDuration,
  DISCARDED,
  HookNames,
  SKIPPED,
  dateNow,
  ONE_MINUTE,
  addTelemetryDebug,
  elapsed,
  relativeNow,
  relativeToClocks,
} from '@datadog/browser-core'
import type { RumSessionManager } from '../rumSessionManager'
import { SessionReplayState, SessionType } from '../rumSessionManager'
import type { PageStateServerEntry } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { RecorderApi } from '../../boot/rumPublicApi'
import type { DefaultRumEventAttributes, DefaultTelemetryEventAttributes, Hooks } from '../hooks'
import type { ViewHistory } from './viewHistory'
import type { PageStateHistory } from './pageStateHistory'
import { PageState } from './pageStateHistory'

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
    // TODO share constant
    const isSessionExpired = dateNow() - Number(session.expire) > 15 * ONE_MINUTE
    const eventDuration = elapsed(startTime, relativeNow())
    const wasInFrozenState = pageStateHistory.wasInPageStateDuringPeriod(PageState.FROZEN, startTime, eventDuration)
    if (isSessionExpired || (wasInFrozenState && eventType !== RumEventType.VIEW)) {
      const pageStatesForPeriod = pageStateHistory.findPageStatesForPeriod(startTime, eventDuration)!
      // monitor-until: 2026-01-01
      addTelemetryDebug('Event sent after session expiration or frozen page state', {
        debug: {
          eventDuration,
          eventType,
          isSessionExpired,
          sessionExpiredSince: isSessionExpired ? dateNow() - Number(session.expire) : undefined,
          elapsedBetweenStartAndExpire: isSessionExpired
            ? Number(session.expire) - relativeToClocks(startTime).timeStamp
            : undefined,
          wasInFrozenState,
          pageStateDuringEventDuration: pageStatesForPeriod as ContextValue,
          sumFrozenDuration: wasInFrozenState ? computeSumFrozenDuration(pageStatesForPeriod) : undefined,
        },
      })
    }

    /**
     * Compute a frozen period duration by looking at the frozen entry start time and the next entry start time
     */
    function computeSumFrozenDuration(pageStates: PageStateServerEntry[]) {
      let sum = 0
      for (let i = 0; i < pageStates.length; i++) {
        if (pageStates[i].state === PageState.FROZEN) {
          const nextStateStart = pageStates[i + 1] ? pageStates[i + 1].start : toServerDuration(relativeNow())
          sum += nextStateStart - pageStates[i].start
        }
      }
      return sum
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
