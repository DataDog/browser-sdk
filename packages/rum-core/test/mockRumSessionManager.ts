import type { RumSessionManager } from '../src/domain/rumSessionManager'
import { RumTrackingType } from '../src/domain/rumSessionManager'

export interface RumSessionManagerMock extends RumSessionManager {
  setId(id: string): RumSessionManagerMock
  setNotTracked(): RumSessionManagerMock
  setReplayPlan(): RumSessionManagerMock
  setProPlan(): RumSessionManagerMock
}

const DEFAULT_ID = 'session-id'

export function createRumSessionManagerMock(): RumSessionManagerMock {
  let id = DEFAULT_ID
  let trackingType = RumTrackingType.TRACKED_REPLAY
  return {
    findTrackedSession() {
      return trackingType !== RumTrackingType.NOT_TRACKED
        ? {
            id,
            hasReplayPlan: trackingType === RumTrackingType.TRACKED_REPLAY,
          }
        : undefined
    },
    setId(newId) {
      id = newId
      return this
    },
    setNotTracked() {
      trackingType = RumTrackingType.NOT_TRACKED
      return this
    },
    setProPlan() {
      trackingType = RumTrackingType.TRACKED_PRO
      return this
    },
    setReplayPlan() {
      trackingType = RumTrackingType.TRACKED_REPLAY
      return this
    },
  }
}
