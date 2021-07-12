import { ErrorSource, ErrorHandling, formatUnknownError, RawError } from '../../tools/error'
import { Observable } from '../../tools/observable'
import { clocksNow } from '../../tools/timeUtils'
import { StackTrace, subscribe, unsubscribe } from '../tracekit'

let traceKitReportHandler: (stack: StackTrace, isWindowError: boolean, errorObject?: any) => void

export function trackRuntimeError(errorObservable: Observable<RawError>) {
  traceKitReportHandler = (stackTrace: StackTrace, _: boolean, errorObject?: any) => {
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
  }
  subscribe(traceKitReportHandler)
  return {
    stop: () => {
      unsubscribe(traceKitReportHandler)
    },
  }
}
