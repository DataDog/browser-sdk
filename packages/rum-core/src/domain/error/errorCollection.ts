import type { Context, RawError, ClocksState, BufferedData } from '@datadog/browser-core'
import {
  BufferedDataType,
  Observable,
  ErrorSource,
  generateUUID,
  computeRawError,
  ErrorHandling,
  NonErrorPrefix,
  combine,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../configuration'
import type { RawRumErrorEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
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

export function startErrorCollection(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  bufferedDataObservable: Observable<BufferedData>
) {
  const errorObservable = new Observable<RawError>()

  bufferedDataObservable.subscribe((bufferedData) => {
    if (bufferedData.type === BufferedDataType.RUNTIME_ERROR) {
      errorObservable.notify(bufferedData.error)
    }
  })

  trackConsoleError(errorObservable)
  trackReportError(configuration, errorObservable)

  errorObservable.subscribe((error) => lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error }))

  return doStartErrorCollection(lifeCycle)
}

export function doStartErrorCollection(lifeCycle: LifeCycle) {
  lifeCycle.subscribe(LifeCycleEventType.RAW_ERROR_COLLECTED, ({ error }) => {
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processError(error))
  })

  return {
    addError: ({ error, handlingStack, componentStack, startClocks, context }: ProvidedError) => {
      const rawError = computeRawError({
        originalError: error,
        handlingStack,
        componentStack,
        startClocks,
        nonErrorPrefix: NonErrorPrefix.PROVIDED,
        source: ErrorSource.CUSTOM,
        handling: ErrorHandling.HANDLED,
      })
      rawError.context = combine(rawError.context, context)

      lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error: rawError })
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
    type: RumEventType.ERROR,
    context: error.context,
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
