import { ErrorSource, ErrorHandling, formatUnknownError, RawError } from '../../tools/error'
import { Observable } from '../../tools/observable'
import { clocksNow } from '../../tools/timeUtils'
import { startUnhandledErrorCollection } from '../tracekit'

export function trackRuntimeError(errorObservable: Observable<RawError>) {
  return startUnhandledErrorCollection((stackTrace, errorObject) => {
    const { stack, message, type } = formatUnknownError(stackTrace, errorObject, 'Uncaught')
    errorObservable.notify({
      message,
      stack,
      type,
      source: ErrorSource.SOURCE,
      startClocks: clocksNow(),
      originalError: errorObject,
      handling: ErrorHandling.UNHANDLED,
    })
  })
}
