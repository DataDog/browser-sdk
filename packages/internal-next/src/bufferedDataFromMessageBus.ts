import type { BufferedData, StackTrace } from '@datadog/browser-core'
import {
  BufferedDataType,
  computeRawError,
  computeStackTraceFromOnErrorMessage,
  ErrorHandling,
  ErrorSource,
  isError,
  NonErrorPrefix,
  Observable,
} from '@datadog/browser-core'
import { MessageType } from './internalApi'
import type { MessageEnvelope } from './internalApi'

// This is temporary. In the future, the buffered data observable should be removed in favor of the
// message bus.
export function createBufferedDataFromMessageBus(bus: Observable<MessageEnvelope>) {
  const bufferedDataObservable = new Observable<BufferedData>()
  bus.subscribe(({ clocks, message }) => {
    switch (message.type) {
      case MessageType.RUNTIME_ERROR: {
        let stackTrace: StackTrace | undefined
        if (!isError(message.error) && message.event) {
          const event = message.event
          stackTrace = computeStackTraceFromOnErrorMessage(event.message, event.filename, event.lineno, event.colno)
        }
        bufferedDataObservable.notify({
          type: BufferedDataType.RUNTIME_ERROR,
          error: computeRawError({
            stackTrace,
            originalError: message.error,
            startClocks: clocks,
            nonErrorPrefix: NonErrorPrefix.UNCAUGHT,
            source: ErrorSource.SOURCE,
            handling: ErrorHandling.UNHANDLED,
          }),
        })
        break
      }
    }
  })

  return bufferedDataObservable
}
