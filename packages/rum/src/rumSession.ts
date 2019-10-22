import {
  cacheCookieAccess,
  Configuration,
  COOKIE_ACCESS_DELAY,
  CookieCache,
  EXPIRATION_DELAY,
  generateUUID,
  performDraw,
  SESSION_COOKIE_NAME,
  throttle,
  trackActivity,
} from '@browser-agent/core'

export const RUM_COOKIE_NAME = '_dd_r'

export interface RumSession {
  getId: () => string | undefined
  isTracked: () => boolean
  isTrackedWithResource: () => boolean
}

export enum RumSessionType {
  NOT_TRACKED = '0',
  TRACKED_WITH_RESOURCES = '1',
  TRACKED_WITHOUT_RESOURCES = '2',
}

export function startRumSession(configuration: Configuration): RumSession {
  const rumSession = cacheCookieAccess(RUM_COOKIE_NAME)
  const sessionId = cacheCookieAccess(SESSION_COOKIE_NAME)

  const expandOrRenewSession = makeExpandOrRenewSession(configuration, rumSession, sessionId)

  expandOrRenewSession()
  trackActivity(expandOrRenewSession)

  return {
    getId: () => sessionId.get(),
    isTracked: () => isTracked(rumSession.get() as RumSessionType),
    isTrackedWithResource: () => rumSession.get() === RumSessionType.TRACKED_WITH_RESOURCES,
  }
}

function makeExpandOrRenewSession(configuration: Configuration, rumSession: CookieCache, sessionId: CookieCache) {
  return throttle(() => {
    let sessionType = rumSession.get() as RumSessionType | undefined
    if (!hasValidRumSession(sessionType)) {
      sessionType = performDraw(configuration.sampleRate)
        ? RumSessionType.TRACKED_WITH_RESOURCES
        : RumSessionType.NOT_TRACKED
      if (sessionType === RumSessionType.TRACKED_WITH_RESOURCES) {
        sessionType = performDraw(configuration.resourceSampleRate)
          ? RumSessionType.TRACKED_WITH_RESOURCES
          : RumSessionType.TRACKED_WITHOUT_RESOURCES
      }
    }
    rumSession.set(sessionType as string, EXPIRATION_DELAY)
    if (isTracked(sessionType)) {
      sessionId.set(sessionId.get() || generateUUID(), EXPIRATION_DELAY)
    }
  }, COOKIE_ACCESS_DELAY)
}

function hasValidRumSession(type?: RumSessionType) {
  return (
    type !== undefined &&
    (type === RumSessionType.NOT_TRACKED ||
      type === RumSessionType.TRACKED_WITH_RESOURCES ||
      type === RumSessionType.TRACKED_WITHOUT_RESOURCES)
  )
}

function isTracked(rumSessionType: RumSessionType | undefined) {
  return (
    rumSessionType === RumSessionType.TRACKED_WITH_RESOURCES ||
    rumSessionType === RumSessionType.TRACKED_WITHOUT_RESOURCES
  )
}
