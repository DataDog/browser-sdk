import { ErrorSource, addTelemetryDebug } from '@datadog/browser-core'
import { timeStampNow } from '@datadog/js-core/time'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import { StatusType } from './logger/isAuthorized'

export function startReportError(lifeCycle: LifeCycle) {
  return (message: string) => {
    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: {
        message,
        date: timeStampNow(),
        origin: ErrorSource.AGENT,
        status: StatusType.error,
      },
    })
    // monitor-until: forever, to keep an eye on the errors reported to customers
    addTelemetryDebug('Error reported to customer', { 'error.message': message })
  }
}
