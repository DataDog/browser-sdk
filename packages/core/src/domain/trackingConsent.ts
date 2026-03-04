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
  onGrantedOnce: (callback: () => void) => void
}

export function createTrackingConsentState(currentConsent?: TrackingConsent): TrackingConsentState {
  const observable = new Observable<void>()

  function isGranted() {
    return currentConsent === TrackingConsent.GRANTED
  }

  return {
    tryToInit(trackingConsent: TrackingConsent) {
      if (!currentConsent) {
        currentConsent = trackingConsent
      }
    },
    onGrantedOnce(fn) {
      if (isGranted()) {
        fn()
      } else {
        const subscription = observable.subscribe(() => {
          if (isGranted()) {
            fn()
            subscription.unsubscribe()
          }
        })
      }
    },
    update(trackingConsent: TrackingConsent) {
      currentConsent = trackingConsent
      observable.notify()
    },
    isGranted,
    observable,
  }
}
