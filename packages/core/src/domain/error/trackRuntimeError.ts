import { ErrorSource, ErrorHandling, formatUnknownError, RawError } from '../../tools/error'
import { Observable } from '../../tools/observable'
import { clocksNow } from '../../tools/timeUtils'
import { StackTrace, startUnhandledErrorCollection } from '../tracekit'

export function trackRuntimeError(errorObservable: Observable<RawError>) {
  return startUnhandledErrorCollection((stackTrace: StackTrace, _: boolean, errorObject?: any) => {
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
