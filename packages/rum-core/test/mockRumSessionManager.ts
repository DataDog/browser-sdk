import { Observable } from '@datadog/browser-core'
import type { RumSessionManager } from '../src/domain/rumSessionManager'

export interface RumSessionManagerMock extends RumSessionManager {
  setId(id: string): RumSessionManagerMock
  setNotTracked(): RumSessionManagerMock
  setTrackedWithoutSessionReplay(): RumSessionManagerMock
  setTrackedWithSessionReplay(): RumSessionManagerMock
}

const DEFAULT_ID = 'session-id'
const enum SessionStatus {
  TRACKED_WITH_SESSION_REPLAY,
  TRACKED_WITHOUT_SESSION_REPLAY,
  NOT_TRACKED,
  EXPIRED,
}

export function createRumSessionManagerMock(): RumSessionManagerMock {
  let id = DEFAULT_ID
  let sessionStatus: SessionStatus = SessionStatus.TRACKED_WITH_SESSION_REPLAY
  return {
    findTrackedSession() {
      if (
        sessionStatus !== SessionStatus.TRACKED_WITH_SESSION_REPLAY &&
        sessionStatus !== SessionStatus.TRACKED_WITHOUT_SESSION_REPLAY
      ) {
        return undefined
      }
      return {
        id,
        sessionReplayAllowed: sessionStatus === SessionStatus.TRACKED_WITH_SESSION_REPLAY,
      }
    },
    expire() {
      sessionStatus = SessionStatus.EXPIRED
      this.expireObservable.notify()
    },
    expireObservable: new Observable(),
    setId(newId) {
      id = newId
      return this
    },
    setNotTracked() {
      sessionStatus = SessionStatus.NOT_TRACKED
      return this
    },
    setTrackedWithoutSessionReplay() {
      sessionStatus = SessionStatus.TRACKED_WITHOUT_SESSION_REPLAY
      return this
    },
    setTrackedWithSessionReplay() {
      sessionStatus = SessionStatus.TRACKED_WITH_SESSION_REPLAY
      return this
    },
  }
}
