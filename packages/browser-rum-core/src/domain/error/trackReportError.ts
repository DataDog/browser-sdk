import type { Observable, RawError } from '@datadog/browser-core'
import { initReportObservable, RawReportType } from '@datadog/browser-core'
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
