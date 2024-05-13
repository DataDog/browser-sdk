import { Observable } from '../tools/observable'

export const TrackingConsent = {
  GRANTED: 'granted',
  NOT_GRANTED: 'not-granted',
} as const
export type TrackingConsent = (typeof TrackingConsent)[keyof typeof TrackingConsent]

export interface TrackingConsentState {
  tryToInit: (trackingConsent: TrackingConsent) => void
  update: (trackingConsent: TrackingConsent) => void
  isGranted: () => boolean
  observable: Observable<void>
}

export function createTrackingConsentState(currentConsent?: TrackingConsent): TrackingConsentState {
  const observable = new Observable<void>()

  return {
    tryToInit(trackingConsent: TrackingConsent) {
      if (!currentConsent) {
        currentConsent = trackingConsent
      }
    },
    update(trackingConsent: TrackingConsent) {
      currentConsent = trackingConsent
      observable.notify()
    },
    isGranted() {
      return currentConsent === TrackingConsent.GRANTED
    },
    observable,
  }
}
