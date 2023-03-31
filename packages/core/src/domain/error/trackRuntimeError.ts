import type { Observable } from '../../tools/observable'
import { clocksNow } from '../../tools/timeUtils'
import { startUnhandledErrorCollection } from '../tracekit'
import { ErrorSource, computeRawError, ErrorHandling } from './error'
import type { RawError } from './error'

export function trackRuntimeError(errorObservable: Observable<RawError>) {
  return startUnhandledErrorCollection((stackTrace, originalError) => {
    errorObservable.notify(
      computeRawError({
        stackTrace,
        originalError,
        startClocks: clocksNow(),
        nonErrorPrefix: 'Uncaught',
        source: ErrorSource.SOURCE,
        handling: ErrorHandling.UNHANDLED,
      })
    )
  })
}
