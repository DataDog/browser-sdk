import type { Observable, RawError } from '@flashcatcloud/browser-core'
import { initReportObservable, RawReportType } from '@flashcatcloud/browser-core'
import type { RumConfiguration } from '../configuration'

export function trackReportError(configuration: RumConfiguration, errorObservable: Observable<RawError>) {
  const subscription = initReportObservable(configuration, [
    RawReportType.cspViolation,
    RawReportType.intervention,
  ]).subscribe((rawError) => errorObservable.notify(rawError))

  return {
    stop: () => {
      subscription.unsubscribe()
    },
  }
}
