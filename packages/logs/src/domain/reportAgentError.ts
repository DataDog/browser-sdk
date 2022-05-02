import type { RawError } from '@datadog/browser-core'
import { ErrorSource } from '@datadog/browser-core'
import type { RawAgentLogsEvent } from '../rawLogsEvent.types'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import { StatusType } from './logger'

export function reportAgentError(error: RawError, lifeCycle: LifeCycle) {
  lifeCycle.notify<RawAgentLogsEvent>(LifeCycleEventType.RAW_LOG_COLLECTED, {
    rawLogsEvent: {
      message: error.message,
      date: error.startClocks.timeStamp,
      error: {
        origin: ErrorSource.AGENT, // Todo: Remove in the next major release
      },
      origin: ErrorSource.AGENT,
      status: StatusType.error,
    },
  })
}
