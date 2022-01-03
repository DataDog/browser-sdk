import { performDraw, startSessionManager, RelativeTime } from '@datadog/browser-core'
import { RumConfiguration } from './configuration'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'

export const RUM_SESSION_KEY = 'rum'

export interface RumSessionManager {
  findTrackedSession: (startTime?: RelativeTime) => RumSession | undefined
}

export type RumSession = {
  id: string
  hasReplayPlan: boolean
  hasLitePlan: boolean
}

export enum RumSessionPlan {
  LITE = 1,
  REPLAY = 2,
}

export enum RumTrackingType {
  NOT_TRACKED = '0',
  // Note: the "tracking type" value (stored in the session cookie) does not match the "session
  // plan" value (sent in RUM events). This is expected, and was done to keep retrocompatibility
  // with active sessions when upgrading the SDK.
  TRACKED_REPLAY = '1',
  TRACKED_LITE = '2',
}

export function startRumSessionManager(configuration: RumConfiguration, lifeCycle: LifeCycle): RumSessionManager {
  const sessionManager = startSessionManager(configuration.cookieOptions, RUM_SESSION_KEY, (rawTrackingType) =>
    computeSessionState(configuration, rawTrackingType)
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
        hasReplayPlan: session.trackingType === RumTrackingType.TRACKED_REPLAY,
        hasLitePlan: session.trackingType === RumTrackingType.TRACKED_LITE,
      }
    },
  }
}

/**
 * Start a tracked replay session stub
 * It needs to be a replay plan in order to get long tasks
 */
export function startRumSessionManagerStub(): RumSessionManager {
  const session = {
    id: '00000000-aaaa-0000-aaaa-000000000000',
    hasReplayPlan: true,
    hasLitePlan: false,
  }
  return {
    findTrackedSession: () => session,
  }
}

function computeSessionState(configuration: RumConfiguration, rawTrackingType?: string) {
  let trackingType: RumTrackingType
  if (hasValidRumSession(rawTrackingType)) {
    trackingType = rawTrackingType
  } else if (!performDraw(configuration.sampleRate)) {
    trackingType = RumTrackingType.NOT_TRACKED
  } else if (!performDraw(configuration.replaySampleRate)) {
    trackingType = RumTrackingType.TRACKED_LITE
  } else {
    trackingType = RumTrackingType.TRACKED_REPLAY
  }
  return {
    trackingType,
    isTracked: isTypeTracked(trackingType),
  }
}

function hasValidRumSession(trackingType?: string): trackingType is RumTrackingType {
  return (
    trackingType === RumTrackingType.NOT_TRACKED ||
    trackingType === RumTrackingType.TRACKED_REPLAY ||
    trackingType === RumTrackingType.TRACKED_LITE
  )
}

function isTypeTracked(rumSessionType: RumTrackingType | undefined) {
  return rumSessionType === RumTrackingType.TRACKED_LITE || rumSessionType === RumTrackingType.TRACKED_REPLAY
}
