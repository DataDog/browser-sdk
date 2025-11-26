import type { Observable, RawError } from '@datadog/browser-core'
import {
  computeRawError,
  clocksNow,
  NonErrorPrefix,
  ErrorSource,
  ErrorHandling,
  computeStackTrace,
  generateUUID,
} from '@datadog/browser-core'
import type { RumEvent } from '@datadog/browser-rum-core'
import { RumEventType } from '@datadog/browser-rum-core'
import type { CollectedRumEvent } from './events'

export function startErrorCollection(onRumEventObservable: Observable<CollectedRumEvent>) {
  process.on('unhandledRejection', (reason) => {
    const error = computeRawError({
      stackTrace: computeStackTrace(reason),
      originalError: reason,
      startClocks: clocksNow(),
      nonErrorPrefix: NonErrorPrefix.UNCAUGHT,
      source: ErrorSource.SOURCE,
      handling: ErrorHandling.UNHANDLED,
    })
    notifyRawError(error)
  })

  process.on('uncaughtException', (originalError) => {
    const error = computeRawError({
      stackTrace: computeStackTrace(originalError),
      originalError,
      startClocks: clocksNow(),
      nonErrorPrefix: NonErrorPrefix.UNCAUGHT,
      source: ErrorSource.SOURCE,
      handling: ErrorHandling.UNHANDLED,
    })
    notifyRawError(error)
  })

  function notifyRawError(error: RawError) {
    const rawRumEvent: Partial<RumEvent> = {
      date: error.startClocks.timeStamp,
      error: {
        id: generateUUID(),
        message: error.message,
        source: error.source,
        stack: error.stack,
        type: error.type,
        handling: error.handling,
        source_type: 'browser',
      },
      type: RumEventType.ERROR,
      context: error.context,
    }
    onRumEventObservable.notify({ event: rawRumEvent as RumEvent, source: 'main-process' })
  }
}
