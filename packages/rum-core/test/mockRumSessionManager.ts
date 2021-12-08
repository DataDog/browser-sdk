import { RumSessionManager, RumTrackingType } from '../src/domain/rumSessionManager'

export interface RumSessionManagerMock extends RumSessionManager {
  setId(id: string): RumSessionManagerMock
  setNotTracked(): RumSessionManagerMock
  setReplayPlan(): RumSessionManagerMock
  setLitePlan(): RumSessionManagerMock
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
            hasLitePlan: trackingType === RumTrackingType.TRACKED_LITE,
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
    setLitePlan() {
      trackingType = RumTrackingType.TRACKED_LITE
      return this
    },
    setReplayPlan() {
      trackingType = RumTrackingType.TRACKED_REPLAY
      return this
    },
  }
}
