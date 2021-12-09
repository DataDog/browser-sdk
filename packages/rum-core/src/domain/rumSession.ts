import { Configuration, performDraw, Session, startSessionManagement, RelativeTime } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'

export const RUM_SESSION_KEY = 'rum'

export interface RumSession {
  getId: (startTime?: RelativeTime) => string | undefined
  isTracked: (startTime?: RelativeTime) => boolean
  hasReplayPlan: (startTime?: RelativeTime) => boolean
  hasLitePlan: (startTime?: RelativeTime) => boolean
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

export function startRumSession(configuration: Configuration, lifeCycle: LifeCycle): RumSession {
  const session = startSessionManagement(configuration.cookieOptions, RUM_SESSION_KEY, (rawTrackingType) =>
    computeSessionState(configuration, rawTrackingType)
  )

  session.expireObservable.subscribe(() => {
    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
  })

  session.renewObservable.subscribe(() => {
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
  })

  return {
    getId: session.getId,
    isTracked: (startTime) => isSessionTracked(session, startTime),
    hasReplayPlan: (startTime) =>
      isSessionTracked(session, startTime) && session.getTrackingType(startTime) === RumTrackingType.TRACKED_REPLAY,
    hasLitePlan: (startTime) =>
      isSessionTracked(session, startTime) && session.getTrackingType(startTime) === RumTrackingType.TRACKED_LITE,
  }
}

/**
 * Start a tracked replay session stub
 * It needs to be a replay plan in order to get long tasks
 */
export function startRumSessionStub(): RumSession {
  return {
    getId: () => '00000000-aaaa-0000-aaaa-000000000000',
    isTracked: () => true,
    hasReplayPlan: () => true,
    hasLitePlan: () => false,
  }
}

function isSessionTracked(session: Session<RumTrackingType>, startTime?: RelativeTime) {
  return session.getId(startTime) !== undefined && isTypeTracked(session.getTrackingType(startTime))
}

function computeSessionState(configuration: Configuration, rawTrackingType?: string) {
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
