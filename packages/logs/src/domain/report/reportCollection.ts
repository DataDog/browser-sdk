import type { Context, ClocksState } from '@datadog/browser-core'
import { timeStampNow, ErrorSource, getFileFromStackTraceString, initReportObservable } from '@datadog/browser-core'
import type { LogsConfiguration } from '../configuration'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { StatusType } from '../logger/isAuthorized'
import { createErrorFieldFromRawError } from '../createErrorFieldFromRawError'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  handlingStack: string
}

export function startReportCollection(configuration: LogsConfiguration, lifeCycle: LifeCycle) {
  const reportSubscription = initReportObservable(configuration, configuration.forwardReports).subscribe((rawError) => {
    let message = rawError.message
    let error
    const status = rawError.originalError.type === 'deprecation' ? StatusType.warn : StatusType.error

    if (status === StatusType.error) {
      error = createErrorFieldFromRawError(rawError)
    } else if (rawError.stack) {
      message += ` Found in ${getFileFromStackTraceString(rawError.stack)!}`
    }

    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: {
        date: timeStampNow(),
        message,
        origin: ErrorSource.REPORT,
        error,
        status,
      },
      messageContext: rawError.context,
    })
  })

  return {
    stop: () => {
      reportSubscription.unsubscribe()
    },
  }
}
