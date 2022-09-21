import type { RawError } from '../../tools/error'
import { ErrorSource, computeRawError } from '../../tools/error'
import type { Observable } from '../../tools/observable'
import { clocksNow } from '../../tools/timeUtils'
import { startUnhandledErrorCollection } from '../tracekit'

export function trackRuntimeError(errorObservable: Observable<RawError>) {
  return startUnhandledErrorCollection((stackTrace, error) => {
    errorObservable.notify(
      computeRawError({
        stackTrace,
        error,
        startClocks: clocksNow(),
        nonErrorPrefix: 'Uncaught',
        source: ErrorSource.SOURCE,
      })
    )
  })
}
