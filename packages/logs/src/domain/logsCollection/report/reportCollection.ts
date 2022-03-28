import type { Context, ClocksState, RawReport } from '@datadog/browser-core'
import { ErrorSource, RawReportType, getFileFromStackTraceString, initReportObservable } from '@datadog/browser-core'
import type { LogsEvent } from '../../../logsEvent.types'
import type { LogsConfiguration } from '../../configuration'
import { StatusType } from '../../logger'
import type { Sender } from '../../sender'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  handlingStack: string
}

const LogStatusForReport = {
  [RawReportType.cspViolation]: StatusType.error,
  [RawReportType.intervention]: StatusType.error,
  [RawReportType.deprecation]: StatusType.warn,
}

export function startReportCollection(configuration: LogsConfiguration, sender: Sender) {
  const reportObservable = initReportObservable(configuration.forwardReports)
  const reportSubscription = reportObservable.subscribe(logReport)

  function logReport(report: RawReport) {
    let message = report.message
    let messageContext: Partial<LogsEvent> | undefined
    const logStatus = LogStatusForReport[report.type]
    if (logStatus === StatusType.error) {
      messageContext = {
        error: {
          kind: report.subtype,
          origin: ErrorSource.REPORT,
          stack: report.stack,
        },
      }
    } else if (report.stack) {
      message += ` Found in ${getFileFromStackTraceString(report.stack)!}`
    }

    sender.sendToHttp(message, messageContext, logStatus)
  }

  return {
    stop: () => {
      reportSubscription.unsubscribe()
    },
  }
}
