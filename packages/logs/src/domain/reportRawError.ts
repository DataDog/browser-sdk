import type { RawError } from '@datadog/browser-core'
import { isExperimentalFeatureEnabled } from '@datadog/browser-core'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import { StatusType } from './logger'

export function reportRawError(error: RawError, lifeCycle: LifeCycle) {
  lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
    rawLog: {
      message: error.message,
      date: error.startClocks.timeStamp,
      error: {
        kind: error.type,
        origin: error.source, // Todo: Remove in the next major release
        stack: error.stack,
      },
      origin: isExperimentalFeatureEnabled('forward-logs') ? error.source : undefined,
      status: StatusType.error,
    },
  })
}
