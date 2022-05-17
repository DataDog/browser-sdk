import type { RumSessionManager } from '../src/domain/rumSessionManager'
import { RumTrackingType } from '../src/domain/rumSessionManager'

export interface RumSessionManagerMock extends RumSessionManager {
  setId(id: string): RumSessionManagerMock
  setNotTracked(): RumSessionManagerMock
  setPremiumPlan(): RumSessionManagerMock
  setLitePlan(): RumSessionManagerMock
}

const DEFAULT_ID = 'session-id'

export function createRumSessionManagerMock(): RumSessionManagerMock {
  let id = DEFAULT_ID
  let trackingType = RumTrackingType.TRACKED_PREMIUM
  return {
    findTrackedSession() {
      return trackingType !== RumTrackingType.NOT_TRACKED
        ? {
            id,
            hasLitePlan: trackingType === RumTrackingType.TRACKED_LITE,
            hasPremiumPlan: trackingType === RumTrackingType.TRACKED_PREMIUM,
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
    setPremiumPlan() {
      trackingType = RumTrackingType.TRACKED_PREMIUM
      return this
    },
  }
}
