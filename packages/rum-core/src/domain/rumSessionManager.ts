import type { RelativeTime, TrackingConsentState } from '@datadog/browser-core'
import {
  BridgeCapability,
  Observable,
  bridgeSupports,
  noop,
  performDraw,
  startSessionManager,
} from '@datadog/browser-core'
import type { RumConfiguration } from './configuration'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'

export const RUM_SESSION_KEY = 'rum'

export interface RumSessionManager {
  findTrackedSession: (startTime?: RelativeTime) => RumSession | undefined
  expire: () => void
  expireObservable: Observable<void>
  setTrackingType: (trackingType: RumTrackingType) => void
}

export type RumSession = {
  id: string
  sampledForReplay: boolean
  sessionReplayAllowed: boolean
}

export const enum RumTrackingType {
  NOT_TRACKED = '0',
  TRACKED_WITH_SESSION_REPLAY = '1',
  TRACKED_WITHOUT_SESSION_REPLAY = '2',
  TRACKED_WITH_FORCED_SESSION_REPLAY = '3',
}

export function startRumSessionManager(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  trackingConsentState: TrackingConsentState
): RumSessionManager {
  const sessionManager = startSessionManager(
    configuration,
    RUM_SESSION_KEY,
    (rawTrackingType) => computeSessionState(configuration, rawTrackingType),
    trackingConsentState
  )

  sessionManager.expireObservable.subscribe(() => {
    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
  })

  sessionManager.renewObservable.subscribe(() => {
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
  })

  return {
    findTrackedSession: (startTime) => {
      const session = sessionManager.findActiveSession(startTime)
      if (!session || !isTypeTracked(session.trackingType)) {
        return
      }
      return {
        id: session.id,
        sampledForReplay: session.trackingType === RumTrackingType.TRACKED_WITH_SESSION_REPLAY,
        sessionReplayAllowed:
          session.trackingType === RumTrackingType.TRACKED_WITH_SESSION_REPLAY ||
          session.trackingType === RumTrackingType.TRACKED_WITH_FORCED_SESSION_REPLAY,
      }
    },
    expire: sessionManager.expire,
    expireObservable: sessionManager.expireObservable,
    setTrackingType: (trackingType: RumTrackingType) => sessionManager.updateSession({ rum: trackingType }),
  }
}

/**
 * Start a tracked replay session stub
 */
export function startRumSessionManagerStub(): RumSessionManager {
  const session: RumSession = {
    id: '00000000-aaaa-0000-aaaa-000000000000',
    sampledForReplay: bridgeSupports(BridgeCapability.RECORDS),
    sessionReplayAllowed: bridgeSupports(BridgeCapability.RECORDS),
  }
  return {
    findTrackedSession: () => session,
    expire: noop,
    expireObservable: new Observable(),
    setTrackingType: noop,
  }
}

function computeSessionState(configuration: RumConfiguration, rawTrackingType?: string) {
  let trackingType: RumTrackingType
  if (hasValidRumSession(rawTrackingType)) {
    trackingType = rawTrackingType
  } else if (!performDraw(configuration.sessionSampleRate)) {
    trackingType = RumTrackingType.NOT_TRACKED
  } else if (!performDraw(configuration.sessionReplaySampleRate)) {
    trackingType = RumTrackingType.TRACKED_WITHOUT_SESSION_REPLAY
  } else {
    trackingType = RumTrackingType.TRACKED_WITH_SESSION_REPLAY
  }
  return {
    trackingType,
    isTracked: isTypeTracked(trackingType),
  }
}

function hasValidRumSession(trackingType?: string): trackingType is RumTrackingType {
  return (
    trackingType === RumTrackingType.NOT_TRACKED ||
    trackingType === RumTrackingType.TRACKED_WITH_SESSION_REPLAY ||
    trackingType === RumTrackingType.TRACKED_WITHOUT_SESSION_REPLAY ||
    trackingType === RumTrackingType.TRACKED_WITH_FORCED_SESSION_REPLAY
  )
}

function isTypeTracked(rumSessionType: RumTrackingType | undefined) {
  return (
    rumSessionType === RumTrackingType.TRACKED_WITHOUT_SESSION_REPLAY ||
    rumSessionType === RumTrackingType.TRACKED_WITH_SESSION_REPLAY ||
    rumSessionType === RumTrackingType.TRACKED_WITH_FORCED_SESSION_REPLAY
  )
}
