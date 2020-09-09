import { Configuration, performDraw, startSessionManagement } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'

export const RUM_SESSION_KEY = 'rum'

export interface RumSession {
  getId: () => string | undefined
  isTracked: () => boolean
  isTrackedWithResource: () => boolean
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
    isTracked: () => session.getId() !== undefined && isTracked(session.getTrackingType()),
    isTrackedWithResource: () =>
      session.getId() !== undefined && session.getTrackingType() === RumTrackingType.TRACKED_WITH_RESOURCES,
  }
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
    isTracked: isTracked(trackingType),
  }
}

function hasValidRumSession(trackingType?: string): trackingType is RumTrackingType {
  return (
    trackingType === RumTrackingType.NOT_TRACKED ||
    trackingType === RumTrackingType.TRACKED_WITH_RESOURCES ||
    trackingType === RumTrackingType.TRACKED_WITHOUT_RESOURCES
  )
}

function isTracked(rumSessionType: RumTrackingType | undefined) {
  return (
    rumSessionType === RumTrackingType.TRACKED_WITH_RESOURCES ||
    rumSessionType === RumTrackingType.TRACKED_WITHOUT_RESOURCES
  )
}
