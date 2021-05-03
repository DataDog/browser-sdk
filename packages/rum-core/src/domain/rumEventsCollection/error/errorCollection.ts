import {
  computeStackTrace,
  Configuration,
  Context,
  formatUnknownError,
  Observable,
  RawError,
  startAutomaticErrorCollection,
  ClocksState,
  preferredTimeStamp,
  createErrorFilter,
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
  return doStartErrorCollection(lifeCycle, startAutomaticErrorCollection(configuration))
}

export function doStartErrorCollection(lifeCycle: LifeCycle, observable: Observable<RawError>) {
  observable.subscribe((error) => lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processError(error)))

  return {
    addError: (
      { error, startClocks, context: customerContext, source }: ProvidedError,
      savedCommonContext?: CommonContext
    ) => {
      const rawError = computeRawError(error, startClocks, source)
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        customerContext,
        savedCommonContext,
        ...processError(rawError),
      })
    },
  }
}

export function createRumErrorFilter(lifeCycle: LifeCycle, configuration: Configuration) {
  return createErrorFilter(configuration, (error) => {
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processError(error))
  })
}

function computeRawError(error: unknown, startClocks: ClocksState, source: ProvidedSource): RawError {
  const stackTrace = error instanceof Error ? computeStackTrace(error) : undefined
  return { startClocks, source, ...formatUnknownError(stackTrace, error, 'Provided') }
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
    type: RumEventType.ERROR as const,
  }

  return {
    rawRumEvent,
    startTime: error.startClocks.relative,
  }
}
