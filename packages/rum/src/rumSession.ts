import { Configuration, performDraw, startSessionManagement } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'

export const RUM_SESSION_KEY = 'rum'

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

class StoredSession {
  private id: string | undefined
  private type: RumSessionType | undefined

  constructor(private isAlive: () => boolean) {}

  store(id: string | undefined, type: RumSessionType | undefined) {
    this.id = id
    this.type = type
  }

  getId() {
    this.makeSureSessionIsAlive()
    return this.id
  }

  isTracked() {
    this.makeSureSessionIsAlive()
    return isTracked(this.type)
  }

  isTrackedWithResource() {
    this.makeSureSessionIsAlive()
    return this.type === RumSessionType.TRACKED_WITH_RESOURCES
  }

  private makeSureSessionIsAlive() {
    if (!this.isAlive()) {
      this.id = undefined
      this.type = undefined
    }
  }
}

export function startRumSession(configuration: Configuration, lifeCycle: LifeCycle): RumSession {
  const session = startSessionManagement(RUM_SESSION_KEY, (rawType) => computeSessionState(configuration, rawType))
  const storedSession = new StoredSession(() => session.getId() !== undefined)

  storedSession.store(session.getId(), session.getType())

  session.renewObservable.subscribe(() => {
    lifeCycle.notify(LifeCycleEventType.SESSION_WILL_RENEW)
    storedSession.store(session.getId(), session.getType())
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
  })

  return storedSession
}

function computeSessionState(configuration: Configuration, rawSessionType?: string) {
  let sessionType: RumSessionType
  if (hasValidRumSession(rawSessionType)) {
    sessionType = rawSessionType
  } else if (!performDraw(configuration.sampleRate)) {
    sessionType = RumSessionType.NOT_TRACKED
  } else if (!performDraw(configuration.resourceSampleRate)) {
    sessionType = RumSessionType.TRACKED_WITHOUT_RESOURCES
  } else {
    sessionType = RumSessionType.TRACKED_WITH_RESOURCES
  }
  return {
    isTracked: isTracked(sessionType),
    type: sessionType,
  }
}

function hasValidRumSession(type?: string): type is RumSessionType {
  return (
    type === RumSessionType.NOT_TRACKED ||
    type === RumSessionType.TRACKED_WITH_RESOURCES ||
    type === RumSessionType.TRACKED_WITHOUT_RESOURCES
  )
}

function isTracked(rumSessionType: RumSessionType | undefined) {
  return (
    rumSessionType === RumSessionType.TRACKED_WITH_RESOURCES ||
    rumSessionType === RumSessionType.TRACKED_WITHOUT_RESOURCES
  )
}
