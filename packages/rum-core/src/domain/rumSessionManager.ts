import type { RelativeTime, TrackingConsentState } from '@datadog/browser-core'
import {
  BridgeCapability,
  Observable,
  SESSION_NOT_TRACKED,
  bridgeSupports,
  noop,
  performDraw,
  startSessionManager,
} from '@datadog/browser-core'
import type { RumConfiguration } from './configuration'

export const enum SessionType {
  SYNTHETICS = 'synthetics',
  USER = 'user',
  CI_TEST = 'ci_test',
}

export const RUM_SESSION_KEY = 'rum'

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
  startSessionManager(
    configuration,
    RUM_SESSION_KEY,
    (rawTrackingType) => computeTrackingType(configuration, rawTrackingType),
    trackingConsentState,
    (sessionManager) => {
      onReady({
        findTrackedSession: (startTime) => {
          const sessionState = sessionManager.findSessionState(startTime)
          if (!sessionState?.id || sessionState[RUM_SESSION_KEY] === RumTrackingType.NOT_TRACKED) {
            return
          }
          return {
            id: sessionState.id,
            sessionReplay:
              sessionState[RUM_SESSION_KEY] === RumTrackingType.TRACKED_WITH_SESSION_REPLAY
                ? SessionReplayState.SAMPLED
                : sessionState.forcedReplay
                  ? SessionReplayState.FORCED
                  : SessionReplayState.OFF,
            anonymousId: sessionState.anonymousId,
          }
        },
        expire: sessionManager.expire,
        expireObservable: sessionManager.expireObservable,
        renewObservable: sessionManager.renewObservable,
        setForcedReplay: () => sessionManager.updateSessionState({ forcedReplay: '1' }),
      })
    }
  )
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

function computeTrackingType(configuration: RumConfiguration, rawTrackingType?: string) {
  if (hasValidRumSession(rawTrackingType)) {
    return rawTrackingType
  }
  if (!performDraw(configuration.sessionSampleRate)) {
    return RumTrackingType.NOT_TRACKED
  }
  if (!performDraw(configuration.sessionReplaySampleRate)) {
    return RumTrackingType.TRACKED_WITHOUT_SESSION_REPLAY
  }
  return RumTrackingType.TRACKED_WITH_SESSION_REPLAY
}

function hasValidRumSession(trackingType?: string): trackingType is RumTrackingType {
  return (
    trackingType === RumTrackingType.NOT_TRACKED ||
    trackingType === RumTrackingType.TRACKED_WITH_SESSION_REPLAY ||
    trackingType === RumTrackingType.TRACKED_WITHOUT_SESSION_REPLAY
  )
}
