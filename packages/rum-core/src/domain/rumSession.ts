import { Configuration, performDraw, Session, startSessionManagement } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'

export const RUM_SESSION_KEY = 'rum'

export interface RumSession {
  getId: () => string | undefined
  getPlan(): RumSessionPlan | undefined
  isTracked: () => boolean
  isTrackedWithResource: () => boolean
}

export enum RumSessionPlan {
  LITE = 1,
  REPLAY = 2,
}

export enum RumTrackingType {
  NOT_TRACKED = '0',
  TRACKED_WITH_RESOURCES = '1',
  TRACKED_WITHOUT_RESOURCES = '2',
}

export function startRumSession(configuration: Configuration, lifeCycle: LifeCycle): RumSession {
  const session = startSessionManagement(configuration.cookieOptions, RUM_SESSION_KEY, (rawTrackingType) =>
    computeSessionState(configuration, rawTrackingType)
  )

  session.renewObservable.subscribe(() => {
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
  })

  return {
    getId: session.getId,
    getPlan: () => getSessionPlan(session),
    isTracked: () => isSessionTracked(session),
    isTrackedWithResource: () =>
      session.getId() !== undefined && session.getTrackingType() === RumTrackingType.TRACKED_WITH_RESOURCES,
  }
}

function isSessionTracked(session: Session<RumTrackingType>) {
  return session.getId() !== undefined && isTypeTracked(session.getTrackingType())
}

function getSessionPlan(session: Session<RumTrackingType>) {
  return isSessionTracked(session)
    ? // TODO: return correct plan based on tracking type
      RumSessionPlan.REPLAY
    : undefined
}

function computeSessionState(configuration: Configuration, rawTrackingType?: string) {
  let trackingType: RumTrackingType
  if (hasValidRumSession(rawTrackingType)) {
    trackingType = rawTrackingType
  } else if (!performDraw(configuration.sampleRate)) {
    trackingType = RumTrackingType.NOT_TRACKED
  } else if (!performDraw(configuration.resourceSampleRate)) {
    trackingType = RumTrackingType.TRACKED_WITHOUT_RESOURCES
  } else {
    trackingType = RumTrackingType.TRACKED_WITH_RESOURCES
  }
  return {
    trackingType,
    isTracked: isTypeTracked(trackingType),
  }
}

function hasValidRumSession(trackingType?: string): trackingType is RumTrackingType {
  return (
    trackingType === RumTrackingType.NOT_TRACKED ||
    trackingType === RumTrackingType.TRACKED_WITH_RESOURCES ||
    trackingType === RumTrackingType.TRACKED_WITHOUT_RESOURCES
  )
}

function isTypeTracked(rumSessionType: RumTrackingType | undefined) {
  return (
    rumSessionType === RumTrackingType.TRACKED_WITH_RESOURCES ||
    rumSessionType === RumTrackingType.TRACKED_WITHOUT_RESOURCES
  )
}
