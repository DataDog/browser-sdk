import type { RumSessionManager } from '../src/domain/rumSessionManager'
import { RumTrackingType, RumSessionPlan } from '../src/domain/rumSessionManager'

export interface RumSessionManagerMock extends RumSessionManager {
  setId(id: string): RumSessionManagerMock
  setNotTracked(): RumSessionManagerMock
  setPremiumPlan(): RumSessionManagerMock
  setLitePlan(): RumSessionManagerMock
  setLongTaskAllowed(longTaskAllowed: boolean): RumSessionManagerMock
  setResourceAllowed(resourceAllowed: boolean): RumSessionManagerMock
}

const DEFAULT_ID = 'session-id'

export function createRumSessionManagerMock(): RumSessionManagerMock {
  let id = DEFAULT_ID
  let trackingType = RumTrackingType.TRACKED_PREMIUM
  return {
    findTrackedSession() {
      if (trackingType === RumTrackingType.NOT_TRACKED) {
        return undefined
      }
      const plan = trackingType === RumTrackingType.TRACKED_PREMIUM ? RumSessionPlan.PREMIUM : RumSessionPlan.LITE
      return {
        id,
        plan,
        sessionReplayAllowed: plan === RumSessionPlan.PREMIUM,
        longTaskAllowed: plan === RumSessionPlan.PREMIUM,
        resourceAllowed: plan === RumSessionPlan.PREMIUM,
      }
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
    setLongTaskAllowed(longTaskAllowed: boolean) {
      trackingType = longTaskAllowed ? RumTrackingType.TRACKED_PREMIUM : RumTrackingType.TRACKED_LITE
      return this
    },
    setResourceAllowed(resourceAllowed: boolean) {
      trackingType = resourceAllowed ? RumTrackingType.TRACKED_PREMIUM : RumTrackingType.TRACKED_LITE
      return this
    },
  }
}
