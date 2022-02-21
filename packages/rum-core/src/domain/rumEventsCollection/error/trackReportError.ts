import type { Observable, RawError } from '@datadog/browser-core'
import { clocksNow, ErrorHandling, ErrorSource, initReportObservable, CustomReportType } from '@datadog/browser-core'

export function trackReportError(errorObservable: Observable<RawError>) {
  const subscription = initReportObservable([CustomReportType.csp_violation, CustomReportType.intervention]).subscribe(
    (reportError) =>
      errorObservable.notify({
        startClocks: clocksNow(),
        message: reportError.message,
        stack: reportError.stack,
        type: reportError.type,
        source: ErrorSource.REPORT,
        handling: ErrorHandling.HANDLED,
      })
  )

  return {
    stop: () => {
      subscription.unsubscribe()
    },
  }
}
