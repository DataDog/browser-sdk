import type { Observable } from '../../tools'
import { clocksNow } from '../../tools'
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
