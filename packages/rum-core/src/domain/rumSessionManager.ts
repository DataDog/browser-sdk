import type { RelativeTime, TrackingConsentState } from '@datadog/browser-core'
import {
  BridgeCapability,
  Observable,
  SESSION_NOT_TRACKED,
  bridgeSupports,
  isSampled,
  noop,
  startSessionManager,
} from '@datadog/browser-core'
import type { RumConfiguration } from './configuration'

export const enum SessionType {
  SYNTHETICS = 'synthetics',
  USER = 'user',
  CI_TEST = 'ci_test',
}

export interface RumSessionManager {
  findTrackedSession: (startTime?: RelativeTime) => RumSession | undefined
  expire: () => void
  expireObservable: Observable<void>
  renewObservable: Observable<void>
  setForcedReplay: () => void
}

export interface RumSession {
  id: string
  sessionReplay: SessionReplayState
  anonymousId?: string
}

export const enum RumTrackingType {
  NOT_TRACKED = SESSION_NOT_TRACKED,
  TRACKED_WITH_SESSION_REPLAY = '1',
  TRACKED_WITHOUT_SESSION_REPLAY = '2',
}

export const enum SessionReplayState {
  OFF,
  SAMPLED,
  FORCED,
}

export function startRumSessionManager(
  configuration: RumConfiguration,
  trackingConsentState: TrackingConsentState,
  onReady: (sessionManager: RumSessionManager) => void
) {
  startSessionManager(configuration, trackingConsentState, (sessionManager) => {
    sessionManager.sessionStateUpdateObservable.subscribe(({ previousState, newState }) => {
      if (!previousState.forcedReplay && newState.forcedReplay) {
        const sessionEntity = sessionManager.findSession()
        if (sessionEntity) {
          sessionEntity.isReplayForced = true
        }
      }
    })

    onReady({
      findTrackedSession: (startTime) => {
        const session = sessionManager.findSession(startTime)
        if (!session || session.id === 'invalid') {
          return
        }

        const trackingType = computeTrackingType(configuration, session.id)
        if (trackingType === RumTrackingType.NOT_TRACKED) {
          return
        }

        return {
          id: session.id,
          sessionReplay:
            trackingType === RumTrackingType.TRACKED_WITH_SESSION_REPLAY
              ? SessionReplayState.SAMPLED
              : session.isReplayForced
                ? SessionReplayState.FORCED
                : SessionReplayState.OFF,
          anonymousId: session.anonymousId,
        }
      },
      expire: sessionManager.expire,
      expireObservable: sessionManager.expireObservable,
      renewObservable: sessionManager.renewObservable,
      setForcedReplay: () => sessionManager.updateSessionState({ forcedReplay: '1' }),
    })
  })
}

/**
 * Start a tracked replay session stub
 */
export function startRumSessionManagerStub(): RumSessionManager {
  const session: RumSession = {
    id: '00000000-aaaa-0000-aaaa-000000000000',
    sessionReplay: bridgeSupports(BridgeCapability.RECORDS) ? SessionReplayState.SAMPLED : SessionReplayState.OFF,
  }
  return {
    findTrackedSession: () => session,
    expire: noop,
    expireObservable: new Observable(),
    renewObservable: new Observable(),
    setForcedReplay: noop,
  }
}

function computeTrackingType(configuration: RumConfiguration, sessionId: string): RumTrackingType {
  if (!isSampled(sessionId, configuration.sessionSampleRate)) {
    return RumTrackingType.NOT_TRACKED
  }

  if (!isSampled(sessionId, configuration.sessionReplaySampleRate)) {
    return RumTrackingType.TRACKED_WITHOUT_SESSION_REPLAY
  }

  return RumTrackingType.TRACKED_WITH_SESSION_REPLAY
}
