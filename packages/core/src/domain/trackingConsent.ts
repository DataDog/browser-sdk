import { ExperimentalFeature, isExperimentalFeatureEnabled } from '../tools/experimentalFeatures'
import { Observable } from '../tools/observable'

export const TrackingConsent = {
  GRANTED: 'granted',
  NOT_GRANTED: 'not-granted',
} as const
export type TrackingConsent = (typeof TrackingConsent)[keyof typeof TrackingConsent]

export interface TrackingConsentState {
  setIfNotDefined: (trackingConsent: TrackingConsent) => void
  set: (trackingConsent: TrackingConsent) => void
  isGranted: () => boolean
  observable: Observable<void>
}

export function createTrackingConsentState(currentConsent?: TrackingConsent): TrackingConsentState {
  const observable = new Observable<void>()

  return {
    setIfNotDefined(trackingConsent: TrackingConsent) {
      if (!currentConsent) {
        currentConsent = trackingConsent
      }
    },
    set(trackingConsent: TrackingConsent) {
      currentConsent = trackingConsent
      observable.notify()
    },
    isGranted() {
      return (
        !isExperimentalFeatureEnabled(ExperimentalFeature.TRACKING_CONSENT) ||
        currentConsent === TrackingConsent.GRANTED
      )
    },
    observable,
  }
}
