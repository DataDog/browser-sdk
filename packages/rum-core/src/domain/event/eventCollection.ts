import type { Context, Duration, RelativeTime } from '@datadog/browser-core'
import type { RumEventDomainContext } from '../../domainContext.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

import type {
  RawRumActionEvent,
  RawRumErrorEvent,
  RawRumLongAnimationFrameEvent,
  RawRumLongTaskEvent,
  RawRumResourceEvent,
  RawRumVitalEvent,
} from '../../rawRumEvent.types'

const allowedEventTypes = ['action', 'error', 'long_task', 'resource', 'vital'] as const

type RawRumEvent =
  | (RawRumErrorEvent & { context: Context })
  | (RawRumResourceEvent & { context: Context })
  | (RawRumLongTaskEvent & { context: Context })
  | (RawRumLongAnimationFrameEvent & { context: Context })
  | (RawRumActionEvent & { context: Context })
  | (RawRumVitalEvent & { context: Context })

export function startEventCollection(lifeCycle: LifeCycle) {
  return {
    addEvent: (
      startTime: RelativeTime,
      event: RawRumEvent,
      domainContext: RumEventDomainContext,
      duration?: Duration
    ) => {
      if (!allowedEventTypes.includes(event.type)) {
        return
      }

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        startTime,
        rawRumEvent: event,
        domainContext,
        duration,
      })
    },
  }
}
