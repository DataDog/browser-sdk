import {
  computeStackTrace,
  Context,
  formatUnknownError,
  RawError,
  ErrorSource,
  ClocksState,
  generateUUID,
  ErrorHandling,
  Observable,
  trackConsoleError,
  trackRuntimeError,
} from '@datadog/browser-core'
import { CommonContext, RawRumErrorEvent, RumEventType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType, RawRumEventCollectedData } from '../../lifeCycle'
import { ForegroundContexts } from '../../foregroundContexts'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  handlingStack: string
}

export function startErrorCollection(lifeCycle: LifeCycle, foregroundContexts: ForegroundContexts) {
  const errorObservable = new Observable<RawError>()
  trackConsoleError(errorObservable)
  trackRuntimeError(errorObservable)

  errorObservable.subscribe((error) => lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error }))

  return doStartErrorCollection(lifeCycle, foregroundContexts)
}

export function doStartErrorCollection(lifeCycle: LifeCycle, foregroundContexts: ForegroundContexts) {
  lifeCycle.subscribe(LifeCycleEventType.RAW_ERROR_COLLECTED, ({ error, customerContext, savedCommonContext }) => {
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      customerContext,
      savedCommonContext,
      ...processError(error, foregroundContexts),
    })
  })

  return {
    addError: (
      { error, handlingStack, startClocks, context: customerContext }: ProvidedError,
      savedCommonContext?: CommonContext
    ) => {
      const rawError = computeRawError(error, handlingStack, startClocks)
      lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, {
        customerContext,
        savedCommonContext,
        error: rawError,
      })
    },
  }
}

function computeRawError(error: unknown, handlingStack: string, startClocks: ClocksState): RawError {
  const stackTrace = error instanceof Error ? computeStackTrace(error) : undefined
  return {
    startClocks,
    source: ErrorSource.CUSTOM,
    originalError: error,
    ...formatUnknownError(stackTrace, error, 'Provided', handlingStack),
    handling: ErrorHandling.HANDLED,
  }
}

function processError(
  error: RawError,
  foregroundContexts: ForegroundContexts
): RawRumEventCollectedData<RawRumErrorEvent> {
  const rawRumEvent: RawRumErrorEvent = {
    date: error.startClocks.timeStamp,
    error: {
      id: generateUUID(),
      message: error.message,
      resource: error.resource
        ? {
            method: error.resource.method,
            status_code: error.resource.statusCode,
            url: error.resource.url,
          }
        : undefined,
      source: error.source,
      stack: error.stack,
      handling_stack: error.handlingStack,
      type: error.type,
      handling: error.handling,
    },
    type: RumEventType.ERROR as const,
  }
  const inForeground = foregroundContexts.isInForegroundAt(error.startClocks.relative)
  if (inForeground !== undefined) {
    rawRumEvent.view = { in_foreground: inForeground }
  }

  return {
    rawRumEvent,
    startTime: error.startClocks.relative,
    domainContext: {
      error: error.originalError,
    },
  }
}
