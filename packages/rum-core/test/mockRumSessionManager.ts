import type { RumSessionManager } from '../src/domain/rumSessionManager'
import { RumSessionPlan } from '../src/domain/rumSessionManager'

export interface RumSessionManagerMock extends RumSessionManager {
  setId(id: string): RumSessionManagerMock
  setNotTracked(): RumSessionManagerMock
  setPlanWithoutSessionReplay(): RumSessionManagerMock
  setPlanWithSessionReplay(): RumSessionManagerMock
  setLongTaskAllowed(longTaskAllowed: boolean): RumSessionManagerMock
  setResourceAllowed(resourceAllowed: boolean): RumSessionManagerMock
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
  let resourceAllowed = true
  let longTaskAllowed = true
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
        plan:
          sessionStatus === SessionStatus.TRACKED_WITH_SESSION_REPLAY
            ? RumSessionPlan.WITH_SESSION_REPLAY
            : RumSessionPlan.WITHOUT_SESSION_REPLAY,
        sessionReplayAllowed: sessionStatus === SessionStatus.TRACKED_WITH_SESSION_REPLAY,
        longTaskAllowed,
        resourceAllowed,
      }
    },
    expire() {
      sessionStatus = SessionStatus.EXPIRED
    },
    setId(newId) {
      id = newId
      return this
    },
    setNotTracked() {
      sessionStatus = SessionStatus.NOT_TRACKED
      return this
    },
    setPlanWithoutSessionReplay() {
      sessionStatus = SessionStatus.TRACKED_WITHOUT_SESSION_REPLAY
      return this
    },
    setPlanWithSessionReplay() {
      sessionStatus = SessionStatus.TRACKED_WITH_SESSION_REPLAY
      return this
    },
    setLongTaskAllowed(isAllowed: boolean) {
      longTaskAllowed = isAllowed
      return this
    },
    setResourceAllowed(isAllowed: boolean) {
      resourceAllowed = isAllowed
      return this
    },
  }
}
