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
import { RumEventType } from '../../rawRumEvent.types'

const allowedEventTypes = [
  RumEventType.ACTION,
  RumEventType.ERROR,
  RumEventType.LONG_TASK,
  RumEventType.RESOURCE,
  RumEventType.VITAL,
] as const

export type AllowedRawRumEvent = (
  | RawRumErrorEvent
  | RawRumResourceEvent
  | RawRumLongTaskEvent
  | RawRumLongAnimationFrameEvent
  | RawRumActionEvent
  | RawRumVitalEvent
) & { context?: Context }

export function startEventCollection(lifeCycle: LifeCycle) {
  return {
    addEvent: (
      startTime: RelativeTime,
      event: AllowedRawRumEvent,
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
