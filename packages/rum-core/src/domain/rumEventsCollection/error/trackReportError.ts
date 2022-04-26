import type { Observable, RawError } from '@datadog/browser-core'
import { clocksNow, ErrorHandling, ErrorSource, initReportObservable, RawReportType } from '@datadog/browser-core'

export function trackReportError(errorObservable: Observable<RawError>) {
  const subscription = initReportObservable([RawReportType.cspViolation, RawReportType.intervention]).subscribe(
    (reportError) =>
      errorObservable.notify({
        startClocks: clocksNow(),
        message: reportError.message,
        stack: reportError.stack,
        type: reportError.subtype,
        source: ErrorSource.REPORT,
        handling: ErrorHandling.UNHANDLED,
      })
  )

  return {
    stop: () => {
      subscription.unsubscribe()
    },
  }
}
