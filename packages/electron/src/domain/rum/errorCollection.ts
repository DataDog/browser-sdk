import type { Observable, RawError } from '@datadog/browser-core'
import {
  monitor,
  NO_ERROR_STACK_PRESENT_MESSAGE,
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
import { app } from 'electron'
import type { CollectedRumEvent } from './events'

export function startErrorCollection(onRumEventObservable: Observable<CollectedRumEvent>) {
  process.on(
    'unhandledRejection',
    monitor((reason) => {
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
  )

  process.on(
    'uncaughtException',
    monitor((originalError) => {
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
  )

  app.on('browser-window-created', (_, window) => {
    window.webContents.on(
      'render-process-gone',
      monitor((_, details) => {
        notifyRawError({
          stack: NO_ERROR_STACK_PRESENT_MESSAGE,
          message: `Render process gone: '${details.reason}'`,
          handling: ErrorHandling.UNHANDLED,
          source: ErrorSource.SOURCE,
          startClocks: clocksNow(),
        })
      })
    )
  })

  app.on(
    'child-process-gone',
    monitor((_, details) => {
      notifyRawError({
        stack: NO_ERROR_STACK_PRESENT_MESSAGE,
        message: `'${details.name || details.serviceName}' process gone: '${details.reason}'`,
        handling: ErrorHandling.UNHANDLED,
        source: ErrorSource.SOURCE,
        startClocks: clocksNow(),
      })
    })
  )

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
