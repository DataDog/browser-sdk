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
    isTracked() {
      return trackingType !== RumTrackingType.NOT_TRACKED
    },
    hasLitePlan() {
      return trackingType === RumTrackingType.TRACKED_LITE
    },
    hasReplayPlan() {
      return trackingType === RumTrackingType.TRACKED_REPLAY
    },
    getId() {
      return trackingType === RumTrackingType.NOT_TRACKED ? undefined : id
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
