import type { RawError } from '../../tools/error'
import { ErrorSource, ErrorHandling, formatUnknownError } from '../../tools/error'
import type { Observable } from '../../tools/observable'
import { clocksNow } from '../../tools/timeUtils'
import { startUnhandledErrorCollection } from '../tracekit'

export function trackRuntimeError(errorObservable: Observable<RawError>) {
  return startUnhandledErrorCollection((stackTrace, errorObject) => {
    const { stack, message, type, causes } = formatUnknownError({
      stackTrace,
      errorObject,
      nonErrorPrefix: 'Uncaught',
      source: ErrorSource.SOURCE,
    })

    errorObservable.notify({
      message,
      stack,
      type,
      source: ErrorSource.SOURCE,
      startClocks: clocksNow(),
      originalError: errorObject,
      handling: ErrorHandling.UNHANDLED,
      causes,
    })
  })
}
