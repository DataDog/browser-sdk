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
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'

export const SessionType = {
  SYNTHETICS: 'synthetics',
  USER: 'user',
  CI_TEST: 'ci_test',
} as const
export type SessionTypeEnum = (typeof SessionType)[keyof typeof SessionType]

export const RUM_SESSION_KEY = 'rum'

export interface RumSessionManager {
  findTrackedSession: (startTime?: RelativeTime) => RumSession | undefined
  expire: () => void
  expireObservable: Observable<void>
  setForcedReplay: () => void
}

export type RumSession = {
  id: string
  sessionReplay: SessionReplayStateEnum
  anonymousId?: string
}

export const RumTrackingType = {
  NOT_TRACKED: SESSION_NOT_TRACKED,
  TRACKED_WITH_SESSION_REPLAY: '1',
  TRACKED_WITHOUT_SESSION_REPLAY: '2',
} as const
export type RumTrackingTypeEnum = (typeof RumTrackingType)[keyof typeof RumTrackingType]

export const SessionReplayState = {
  OFF: 0,
  SAMPLED: 1,
  FORCED: 2,
} as const
export type SessionReplayStateEnum = (typeof SessionReplayState)[keyof typeof SessionReplayState]

export function startRumSessionManager(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  trackingConsentState: TrackingConsentState
): RumSessionManager {
  const sessionManager = startSessionManager(
    configuration,
    RUM_SESSION_KEY,
    (rawTrackingType) => computeTrackingType(configuration, rawTrackingType),
    trackingConsentState
  )

  sessionManager.expireObservable.subscribe(() => {
    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
  })

  sessionManager.renewObservable.subscribe(() => {
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
  })

  sessionManager.sessionStateUpdateObservable.subscribe(({ previousState, newState }) => {
    if (!previousState.forcedReplay && newState.forcedReplay) {
      const sessionEntity = sessionManager.findSession()
      if (sessionEntity) {
        sessionEntity.isReplayForced = true
      }
    }
  })
  return {
    findTrackedSession: (startTime) => {
      const session = sessionManager.findSession(startTime)
      if (!session || session.trackingType === RumTrackingType.NOT_TRACKED) {
        return
      }
      return {
        id: session.id,
        sessionReplay:
          session.trackingType === RumTrackingType.TRACKED_WITH_SESSION_REPLAY
            ? SessionReplayState.SAMPLED
            : session.isReplayForced
              ? SessionReplayState.FORCED
              : SessionReplayState.OFF,
        anonymousId: session.anonymousId,
      }
    },
    expire: sessionManager.expire,
    expireObservable: sessionManager.expireObservable,
    setForcedReplay: () => sessionManager.updateSessionState({ forcedReplay: '1' }),
  }
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

function hasValidRumSession(trackingType?: string): trackingType is RumTrackingTypeEnum {
  return (
    trackingType === RumTrackingType.NOT_TRACKED ||
    trackingType === RumTrackingType.TRACKED_WITH_SESSION_REPLAY ||
    trackingType === RumTrackingType.TRACKED_WITHOUT_SESSION_REPLAY
  )
}
