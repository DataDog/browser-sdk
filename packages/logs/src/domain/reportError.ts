import type { Component, RawError } from '@datadog/browser-core'
import { ErrorSource, addTelemetryDebug } from '@datadog/browser-core'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType, startLogsLifeCycle } from './lifeCycle'
import { StatusType } from './logger'

export const startReportError: Component<(error: RawError) => void, [LifeCycle]> = (lifeCycle) => (error) => {
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
/* eslint-disable local-rules/disallow-side-effects */
startReportError.$deps = [startLogsLifeCycle]
/* eslint-enable local-rules/disallow-side-effects */
