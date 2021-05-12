import {
  computeStackTrace,
  Configuration,
  Context,
  formatUnknownError,
  RawError,
  startAutomaticErrorCollection,
  ClocksState,
  preferredTimeStamp,
} from '@datadog/browser-core'
import { CommonContext, RawRumErrorEvent, RumEventType } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  source: ProvidedSource
}

export type ProvidedSource = 'custom' | 'network' | 'source'

export function startErrorCollection(lifeCycle: LifeCycle, configuration: Configuration) {
  startAutomaticErrorCollection(configuration).subscribe((error) =>
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error })
  )

  return doStartErrorCollection(lifeCycle, configuration)
}

export function doStartErrorCollection(lifeCycle: LifeCycle, configuration: Configuration) {
  lifeCycle.subscribe(LifeCycleEventType.RAW_ERROR_COLLECTED, ({ error, customerContext, savedCommonContext }) => {
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      customerContext,
      savedCommonContext,
      ...processError(error),
    })
  })

  return {
    addError: (
      { error, startClocks, context: customerContext, source }: ProvidedError,
      savedCommonContext?: CommonContext
    ) => {
      const rawError = computeRawError(error, startClocks, source, configuration)
      lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, {
        customerContext,
        savedCommonContext,
        error: rawError,
      })
    },
  }
}

function computeRawError(
  error: unknown,
  startClocks: ClocksState,
  source: ProvidedSource,
  configuration: Configuration
): RawError {
  const stackTrace = error instanceof Error ? computeStackTrace(error) : undefined
  const err: RawError = {
    startClocks,
    source,
    ...formatUnknownError(stackTrace, error, 'Provided'),
    inForeground: configuration.isEnabled('track-foreground') ? document.hasFocus() : undefined,
  }
  return err
}

function processError(error: RawError) {
  const rawRumEvent: RawRumErrorEvent = {
    date: preferredTimeStamp(error.startClocks),
    error: {
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
    view: {},
    type: RumEventType.ERROR as const,
  }
  if (error.inForeground != null) {
    rawRumEvent.view = {
      in_foreground: error.inForeground,
    }
  }

  return {
    rawRumEvent,
    startTime: error.startClocks.relative,
  }
}
