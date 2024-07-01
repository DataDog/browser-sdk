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
  NonErrorPrefix,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import type { RawRumErrorEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { FeatureFlagContexts } from '../contexts/featureFlagContext'
import type { CommonContext } from '../contexts/commonContext'
import type { PageStateHistory } from '../contexts/pageStateHistory'
import { PageState } from '../contexts/pageStateHistory'
import type { RumErrorEventDomainContext } from '../../domainContext.types'
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
  configuration: RumConfiguration,
  pageStateHistory: PageStateHistory,
  featureFlagContexts: FeatureFlagContexts
) {
  const errorObservable = new Observable<RawError>()

  trackConsoleError(errorObservable)
  trackRuntimeError(errorObservable)
  trackReportError(configuration, errorObservable)

  errorObservable.subscribe((error) => lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error }))

  return doStartErrorCollection(lifeCycle, pageStateHistory, featureFlagContexts)
}

export function doStartErrorCollection(
  lifeCycle: LifeCycle,
  pageStateHistory: PageStateHistory,
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
        processError(error, pageStateHistory, featureFlagContexts)
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
        nonErrorPrefix: NonErrorPrefix.PROVIDED,
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
  pageStateHistory: PageStateHistory,
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
      fingerprint: error.fingerprint,
      csp: error.csp,
    },
    type: RumEventType.ERROR as const,
    view: { in_foreground: pageStateHistory.wasInPageStateAt(PageState.ACTIVE, error.startClocks.relative) },
  }

  const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations(error.startClocks.relative)
  if (featureFlagContext && !isEmptyObject(featureFlagContext)) {
    rawRumEvent.feature_flags = featureFlagContext
  }

  const domainContext: RumErrorEventDomainContext = {
    error: error.originalError,
    handlingStack: error.handlingStack,
  }

  return {
    rawRumEvent,
    startTime: error.startClocks.relative,
    domainContext,
  }
}
