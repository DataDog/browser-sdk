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
import type { FeatureFlagContexts } from '../../contexts/featureFlagContext'
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
  featureFlagContexts: FeatureFlagContexts
) {
  const errorObservable = new Observable<RawError>()

  trackConsoleError(errorObservable)
  trackRuntimeError(errorObservable)
  trackReportError(errorObservable)

  errorObservable.subscribe((error) => lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error }))

  return doStartErrorCollection(lifeCycle, foregroundContexts, featureFlagContexts)
}

export function doStartErrorCollection(
  lifeCycle: LifeCycle,
  foregroundContexts: ForegroundContexts,
  featureFlagContexts: FeatureFlagContexts
) {
  lifeCycle.subscribe(LifeCycleEventType.RAW_ERROR_COLLECTED, ({ error, customerContext, savedCommonContext }) => {
    lifeCycle.notify(
      LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
      assign(
        {
          customerContext,
          savedCommonContext,
        },
        processError(error, foregroundContexts, featureFlagContexts)
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
  featureFlagContexts: FeatureFlagContexts
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

  const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations(error.startClocks.relative)
  if (featureFlagContext && !isEmptyObject(featureFlagContext)) {
    rawRumEvent.feature_flags = featureFlagContext
  }

  return {
    rawRumEvent,
    startTime: error.startClocks.relative,
    domainContext: {
      error: error.originalError,
    },
  }
}
