import {
  computeStackTrace,
  Configuration,
  Context,
  formatUnknownError,
  getTimestamp,
  Observable,
  RawError,
  startAutomaticErrorCollection,
} from '@datadog/browser-core'
import { RumErrorEvent, RumEventType } from '../../../types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'

export interface ProvidedError {
  startTime: number
  error: unknown
  context?: Context
  source: 'custom' | 'network' | 'source'
}

export function startErrorCollection(lifeCycle: LifeCycle, configuration: Configuration) {
  return doStartErrorCollection(lifeCycle, configuration, startAutomaticErrorCollection(configuration))
}

export function doStartErrorCollection(
  lifeCycle: LifeCycle,
  configuration: Configuration,
  observable: Observable<RawError>
) {
  observable.subscribe((error) => lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processError(error)))

  return {
    addError({ error, startTime, context: customerContext, source }: ProvidedError, savedGlobalContext?: Context) {
      const rawError = computeRawError(error, startTime, source)
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        customerContext,
        savedGlobalContext,
        ...processError(rawError),
      })
    },
  }
}

function computeRawError(error: unknown, startTime: number, source: 'custom' | 'network' | 'source'): RawError {
  const stackTrace = error instanceof Error ? computeStackTrace(error) : undefined
  return { startTime, source, ...formatUnknownError(stackTrace, error, 'Provided') }
}

function processError(error: RawError) {
  const rawRumEvent: RumErrorEvent = {
    date: getTimestamp(error.startTime),
    error: {
      message: error.message,
      resource: error.resource,
      source: error.source,
      stack: error.stack,
      type: error.type,
    },
    type: RumEventType.ERROR as const,
  }

  return {
    rawRumEvent,
    startTime: error.startTime,
  }
}
