import type { Context, ClocksState } from '@datadog/browser-core'
import {
  timeStampNow,
  ErrorSource,
  getFileFromStackTraceString,
  initReportObservable,
  ErrorHandling,
} from '@datadog/browser-core'
import type { LogsConfiguration } from '../configuration'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { StatusType } from '../logger/isAuthorized'

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
      error = {
        kind: rawError.type,
        stack: rawError.stack,
      }
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
    })
  })

  return {
    stop: () => {
      reportSubscription.unsubscribe()
    },
  }
}
