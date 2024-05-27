import type { RawError } from '@datadog/browser-core'
import { ErrorSource, addTelemetryDebug } from '@datadog/browser-core'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import { StatusType } from './logger'

export function startReportError(lifeCycle: LifeCycle) {
  return (error: RawError) => {
    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: {
        date: error.startClocks.timeStamp,
        message: error.message,
        status: StatusType.error,
        origin: ErrorSource.AGENT,
      },
    })
    addTelemetryDebug('Error reported to customer', { 'error.message': error.message })
  }
}
