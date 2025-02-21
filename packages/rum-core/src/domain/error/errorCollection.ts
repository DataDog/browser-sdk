import type { Context, RawError, ClocksState } from '@datadog/browser-core'
import {
  ErrorSource,
  generateUUID,
  computeRawError,
  ErrorHandling,
  computeStackTrace,
  Observable,
  trackRuntimeError,
  NonErrorPrefix,
  isError,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import type { RawRumErrorEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { CommonContext } from '../contexts/commonContext'
import type { RumErrorEventDomainContext } from '../../domainContext.types'
import { trackConsoleError } from './trackConsoleError'
import { trackReportError } from './trackReportError'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  handlingStack: string
  componentStack?: string
}

export function startErrorCollection(lifeCycle: LifeCycle, configuration: RumConfiguration) {
  const errorObservable = new Observable<RawError>()

  trackConsoleError(errorObservable)
  trackRuntimeError(errorObservable)
  trackReportError(configuration, errorObservable)

  errorObservable.subscribe((error) => lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error }))

  return doStartErrorCollection(lifeCycle)
}

export function doStartErrorCollection(lifeCycle: LifeCycle) {
  lifeCycle.subscribe(LifeCycleEventType.RAW_ERROR_COLLECTED, ({ error, customerContext, savedCommonContext }) => {
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      customerContext,
      savedCommonContext,
      ...processError(error),
    })
  })

  return {
    addError: (
      { error, handlingStack, componentStack, startClocks, context: customerContext }: ProvidedError,
      savedCommonContext?: CommonContext
    ) => {
      const stackTrace = isError(error) ? computeStackTrace(error) : undefined
      const rawError = computeRawError({
        stackTrace,
        originalError: error,
        handlingStack,
        componentStack,
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

function processError(error: RawError): RawRumEventCollectedData<RawRumErrorEvent> {
  const rawRumEvent: RawRumErrorEvent = {
    date: error.startClocks.timeStamp,
    error: {
      id: generateUUID(),
      message: error.message,
      source: error.source,
      stack: error.stack,
      handling_stack: error.handlingStack,
      component_stack: error.componentStack,
      type: error.type,
      handling: error.handling,
      causes: error.causes,
      source_type: 'browser',
      fingerprint: error.fingerprint,
      csp: error.csp,
    },
    type: RumEventType.ERROR as const,
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
