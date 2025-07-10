import { Observable } from '../tools/observable'
import { createValueHistory } from '../tools/valueHistory'
import type { RelativeTime } from '../tools/utils/timeUtils'
import { relativeNow } from '../tools/utils/timeUtils'

export const TrackingConsent = {
  GRANTED: 'granted',
  NOT_GRANTED: 'not-granted',
} as const
export type TrackingConsent = (typeof TrackingConsent)[keyof typeof TrackingConsent]

export interface TrackingConsentState {
  tryToInit: (trackingConsent: TrackingConsent) => void
  update: (trackingConsent: TrackingConsent) => void
  isGranted: (startTime?: RelativeTime) => boolean
  observable: Observable<void>
}

export function createTrackingConsentState(currentConsent?: TrackingConsent): TrackingConsentState {
  const observable = new Observable<void>()
  const history = createValueHistory<TrackingConsent>({ expireDelay: 1000 })

  if (currentConsent) {
    history.add(currentConsent, relativeNow())
  }

  return {
    tryToInit(trackingConsent: TrackingConsent) {
      if (!currentConsent) {
        currentConsent = trackingConsent
        history.add(trackingConsent, relativeNow())
      }
    },
    update(trackingConsent: TrackingConsent) {
      currentConsent = trackingConsent
      history.closeActive(relativeNow())
      history.add(trackingConsent, relativeNow())
      observable.notify()
    },
    isGranted(startTime?: RelativeTime) {
      const value = startTime === undefined ? currentConsent : (history.find(startTime) ?? currentConsent)

      return value === TrackingConsent.GRANTED
    },
    observable,
  }
}
