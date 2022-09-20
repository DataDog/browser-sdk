import type { RelativeTime } from '@datadog/browser-core'
import { performDraw, startSessionManager } from '@datadog/browser-core'
import type { RumConfiguration } from './configuration'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'

export const RUM_SESSION_KEY = 'rum'

export interface RumSessionManager {
  findTrackedSession: (startTime?: RelativeTime) => RumSession | undefined
}

export type RumSession = {
  id: string
  plan: RumSessionPlan
  sessionReplayAllowed: boolean
  longTaskAllowed: boolean
  resourceAllowed: boolean
}

export const enum RumSessionPlan {
  LITE = 1,
  PREMIUM = 2,
}

export const enum RumTrackingType {
  NOT_TRACKED = '0',
  // Note: the "tracking type" value (stored in the session cookie) does not match the "session
  // plan" value (sent in RUM events). This is expected, and was done to keep retrocompatibility
  // with active sessions when upgrading the SDK.
  TRACKED_PREMIUM = '1',
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
      const plan =
        session.trackingType === RumTrackingType.TRACKED_PREMIUM ? RumSessionPlan.PREMIUM : RumSessionPlan.LITE
      return {
        id: session.id,
        plan,
        sessionReplayAllowed: plan === RumSessionPlan.PREMIUM,
        longTaskAllowed: plan === RumSessionPlan.PREMIUM,
        resourceAllowed: plan === RumSessionPlan.PREMIUM,
      }
    },
  }
}

/**
 * Start a tracked replay session stub
 */
export function startRumSessionManagerStub(): RumSessionManager {
  const session: RumSession = {
    id: '00000000-aaaa-0000-aaaa-000000000000',
    plan: RumSessionPlan.PREMIUM, // plan value should not be taken into account for mobile
    sessionReplayAllowed: false,
    longTaskAllowed: true,
    resourceAllowed: true,
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
  } else if (!performDraw(configuration.premiumSampleRate)) {
    trackingType = RumTrackingType.TRACKED_LITE
  } else {
    trackingType = RumTrackingType.TRACKED_PREMIUM
  }
  return {
    trackingType,
    isTracked: isTypeTracked(trackingType),
  }
}

function hasValidRumSession(trackingType?: string): trackingType is RumTrackingType {
  return (
    trackingType === RumTrackingType.NOT_TRACKED ||
    trackingType === RumTrackingType.TRACKED_PREMIUM ||
    trackingType === RumTrackingType.TRACKED_LITE
  )
}

function isTypeTracked(rumSessionType: RumTrackingType | undefined) {
  return rumSessionType === RumTrackingType.TRACKED_LITE || rumSessionType === RumTrackingType.TRACKED_PREMIUM
}
