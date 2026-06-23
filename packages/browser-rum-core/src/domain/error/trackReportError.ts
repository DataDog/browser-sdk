import type { Observable, RawError } from '@openobserve/browser-core'
import { initReportObservable, RawReportType } from '@openobserve/browser-core'
export function trackReportError(errorObservable: Observable<RawError>) {
  const subscription = initReportObservable([RawReportType.cspViolation, RawReportType.intervention]).subscribe(
    (rawError) => errorObservable.notify(rawError)
  )

  return {
    stop: () => {
      subscription.unsubscribe()
    },
  }
}
