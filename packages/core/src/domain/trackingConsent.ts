import { Observable } from '../tools/observable'
import { createValueHistory } from '../tools/valueHistory'
import type { RelativeTime } from '../tools/utils/timeUtils'
import { clocksOrigin, relativeNow } from '../tools/utils/timeUtils'
import { SESSION_TIME_OUT_DELAY } from './session/sessionConstants'

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

export function createTrackingConsentState(initialConsent?: TrackingConsent): TrackingConsentState {
  const observable = new Observable<void>()
  // Reuse the same expire delay as the session timeout delay because the tracking consent is expected to be valid for the same duration as the session.
  const history = createValueHistory<TrackingConsent>({ expireDelay: SESSION_TIME_OUT_DELAY })

  if (initialConsent) {
    history.add(initialConsent, relativeNow())
  }

  return {
    tryToInit(trackingConsent: TrackingConsent) {
      if (!initialConsent) {
        const historySize = (history.findAll() ?? []).length
        const entry = history.add(trackingConsent, clocksOrigin().relative)

        const isAlreadySet = historySize !== 0

        if (isAlreadySet) {
          entry.close(relativeNow())
        }
      }
    },
    update(trackingConsent: TrackingConsent) {
      history.closeActive(relativeNow())
      history.add(trackingConsent, relativeNow())
      observable.notify()
    },
    isGranted(startTime?: RelativeTime) {
      return (history.find(startTime) ?? initialConsent) === TrackingConsent.GRANTED
    },
    observable,
  }
}
