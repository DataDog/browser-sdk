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

export function createRumSessionManagerMock(): RumSessionManagerMock {
  let id = DEFAULT_ID
  let tracked = true
  let sessionReplayAllowed = true
  let resourceAllowed = true
  let longTaskAllowed = true
  return {
    findTrackedSession() {
      if (!tracked) {
        return undefined
      }
      return {
        id,
        plan: sessionReplayAllowed ? RumSessionPlan.WITH_SESSION_REPLAY : RumSessionPlan.WITHOUT_SESSION_REPLAY,
        sessionReplayAllowed,
        longTaskAllowed,
        resourceAllowed,
      }
    },
    setId(newId) {
      id = newId
      return this
    },
    setNotTracked() {
      tracked = false
      return this
    },
    setPlanWithoutSessionReplay() {
      tracked = true
      sessionReplayAllowed = false
      return this
    },
    setPlanWithSessionReplay() {
      tracked = true
      sessionReplayAllowed = true
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
