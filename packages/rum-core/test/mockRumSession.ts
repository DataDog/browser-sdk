import { RumSession, RumTrackingType } from '../src/domain/rumSession'

export interface RumSessionMock extends RumSession {
  setId(id: string): RumSessionMock
  setNotTracked(): RumSessionMock
  setReplayPlan(): RumSessionMock
  setLitePlan(): RumSessionMock
}

const DEFAULT_ID = 'session-id'

export function createRumSessionMock(): RumSessionMock {
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
    getInMemoryPlan: () => trackingType,
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
