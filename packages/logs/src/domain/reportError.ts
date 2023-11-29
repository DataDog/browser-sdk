import type { RawError } from '@datadog/browser-core'
import { ErrorSource, addTelemetryDebug } from '@datadog/browser-core'
import { LogsComponents } from '../boot/logsComponents'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import { StatusType } from './logger'

export function startReportError(lifeCycle: LifeCycle) {
  return (error: RawError) => {
    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: {
        message: error.message,
        date: error.startClocks.timeStamp,
        origin: ErrorSource.AGENT,
        status: StatusType.error,
      },
    })
    addTelemetryDebug('Error reported to customer', { 'error.message': error.message })
  }
}
/* eslint-disable local-rules/disallow-side-effects */
startReportError.$id = LogsComponents.ReportError
startReportError.$deps = [LogsComponents.LifeCycle]
/* eslint-enable local-rules/disallow-side-effects */
