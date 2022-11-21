import type { Context, RawError, ClocksState } from '@datadog/browser-core'
import {
  isEmptyObject,
  assign,
  ErrorSource,
  generateUUID,
  computeRawError,
  ErrorHandling,
  computeStackTrace,
  Observable,
  trackRuntimeError,
} from '@datadog/browser-core'
import type { CommonContext, RawRumErrorEvent } from '../../../rawRumEvent.types'
import { RumEventType } from '../../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import type { ForegroundContexts } from '../../contexts/foregroundContexts'
import type { ViewContexts } from '../../contexts/viewContexts'
import { trackConsoleError } from './trackConsoleError'
import { trackReportError } from './trackReportError'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  handlingStack: string
}

export function startErrorCollection(
  lifeCycle: LifeCycle,
  foregroundContexts: ForegroundContexts,
  viewContexts: ViewContexts
) {
  const errorObservable = new Observable<RawError>()

  trackConsoleError(errorObservable)
  trackRuntimeError(errorObservable)
  trackReportError(errorObservable)

  errorObservable.subscribe((error) => lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error }))

  return doStartErrorCollection(lifeCycle, foregroundContexts, viewContexts)
}

export function doStartErrorCollection(
  lifeCycle: LifeCycle,
  foregroundContexts: ForegroundContexts,
  viewContexts: ViewContexts
) {
  lifeCycle.subscribe(LifeCycleEventType.RAW_ERROR_COLLECTED, ({ error, customerContext, savedCommonContext }) => {
    lifeCycle.notify(
      LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
      assign(
        {
          customerContext,
          savedCommonContext,
        },
        processError(error, foregroundContexts, viewContexts)
      )
    )
  })

  return {
    addError: (
      { error, handlingStack, startClocks, context: customerContext }: ProvidedError,
      savedCommonContext?: CommonContext
    ) => {
      const stackTrace = error instanceof Error ? computeStackTrace(error) : undefined
      const rawError = computeRawError({
        stackTrace,
        originalError: error,
        handlingStack,
        startClocks,
        nonErrorPrefix: 'Provided',
        source: ErrorSource.CUSTOM,
        handling: ErrorHandling.HANDLED,
      })

      lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, {
        customerContext,
        savedCommonContext,
        error: rawError,
      })
    },
  }
}

function processError(
  error: RawError,
  foregroundContexts: ForegroundContexts,
  viewContexts: ViewContexts
): RawRumEventCollectedData<RawRumErrorEvent> {
  const rawRumEvent: RawRumErrorEvent = {
    date: error.startClocks.timeStamp,
    error: {
      id: generateUUID(),
      message: error.message,
      source: error.source,
      stack: error.stack,
      handling_stack: error.handlingStack,
      type: error.type,
      handling: error.handling,
      causes: error.causes,
      source_type: 'browser',
    },
    type: RumEventType.ERROR as const,
  }
  const inForeground = foregroundContexts.isInForegroundAt(error.startClocks.relative)
  if (inForeground) {
    rawRumEvent.view = { in_foreground: inForeground }
  }

  const viewContext = viewContexts.findView(error.startClocks.relative)
  if (viewContext && !isEmptyObject(viewContext.featureFlagEvaluations)) {
    rawRumEvent.feature_flags = viewContext.featureFlagEvaluations
  }

  return {
    rawRumEvent,
    startTime: error.startClocks.relative,
    domainContext: {
      error: error.originalError,
    },
  }
}
