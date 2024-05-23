import type { Observable, RawError } from '@datadog/browser-core'
import { clocksNow, ErrorHandling, ErrorSource, initReportObservable, RawReportType } from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'

export function trackReportError(configuration: RumConfiguration, errorObservable: Observable<RawError>) {
  const subscription = initReportObservable(configuration, [
    RawReportType.cspViolation,
    RawReportType.intervention,
  ]).subscribe((reportError) => {
    const rawError: RawError = {
      startClocks: clocksNow(),
      message: reportError.message,
      type: reportError.subtype,
      stack: reportError.stack,
      source: ErrorSource.REPORT,
      originalError: reportError.originalReport,
      handling: ErrorHandling.UNHANDLED,
    }

    if (reportError.originalReport.type === 'securitypolicyviolation') {
      rawError.csp = {
        disposition: reportError.originalReport.disposition,
      }
    }

    return errorObservable.notify(rawError)
  })

  return {
    stop: () => {
      subscription.unsubscribe()
    },
  }
}
