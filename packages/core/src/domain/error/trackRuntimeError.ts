import { NonErrorPrefix, ErrorSource, ErrorHandling } from '../../tools/error.types'
import type { RawError } from '../../tools/error.types'
import { computeRawError } from '../../tools/error'
import type { Observable } from '../../tools/observable'
import { clocksNow } from '../../tools/timeUtils'
import { startUnhandledErrorCollection } from '../tracekit'

export function trackRuntimeError(errorObservable: Observable<RawError>) {
  return startUnhandledErrorCollection((stackTrace, originalError) => {
    errorObservable.notify(
      computeRawError({
        stackTrace,
        originalError,
        startClocks: clocksNow(),
        nonErrorPrefix: NonErrorPrefix.UNCAUGHT,
        source: ErrorSource.SOURCE,
        handling: ErrorHandling.UNHANDLED,
      })
    )
  })
}
