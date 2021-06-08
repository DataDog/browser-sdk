import {
  computeStackTrace,
  Configuration,
  Context,
  formatUnknownError,
  RawError,
  startAutomaticErrorCollection,
  ClocksState,
  generateUUID,
} from '@datadog/browser-core'
import { CommonContext, RawRumErrorEvent, RumEventType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType, RawRumEventCollectedData } from '../../lifeCycle'
import { ForegroundContexts } from '../../foregroundContexts'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  source: ProvidedSource
}

export type ProvidedSource = 'custom' | 'network' | 'source'

export function startErrorCollection(
  lifeCycle: LifeCycle,
  configuration: Configuration,
  foregroundContexts: ForegroundContexts
) {
  startAutomaticErrorCollection(configuration).subscribe((error) =>
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error })
  )

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
      { error, startClocks, context: customerContext, source }: ProvidedError,
      savedCommonContext?: CommonContext
    ) => {
      const rawError = computeRawError(error, startClocks, source)
      lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, {
        customerContext,
        savedCommonContext,
        error: rawError,
      })
    },
  }
}

function computeRawError(error: unknown, startClocks: ClocksState, source: ProvidedSource): RawError {
  const stackTrace = error instanceof Error ? computeStackTrace(error) : undefined
  return { startClocks, source, originalError: error, ...formatUnknownError(stackTrace, error, 'Provided') }
}

function processError(error: RawError, foregroundContexts: ForegroundContexts): RawRumEventCollectedData {
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
      type: error.type,
    },
    type: RumEventType.ERROR as const,
  }
  const inForeground = foregroundContexts.getInForeground(error.startClocks.relative)
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
