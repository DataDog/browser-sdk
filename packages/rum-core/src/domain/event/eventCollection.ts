import type { Duration, RelativeTime } from '@datadog/browser-core'
import type { RumEventDomainContext } from '../../domainContext.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type {
  RumActionEvent,
  RumErrorEvent,
  RumLongTaskEvent,
  RumResourceEvent,
  RumVitalEvent,
} from '../../rumEvent.types'
import type { RawRumEvent } from '../../rawRumEvent.types'

type CommonProperties = 'type' | 'date' | 'context'

type PartialRumActionEvent = Pick<RumActionEvent, CommonProperties | 'action'>
type PartialRumErrorEvent = Pick<RumErrorEvent, CommonProperties | 'error'>
type PartialRumLongTaskEvent = Pick<RumLongTaskEvent, CommonProperties | 'long_task'>
type PartialRumResourceEvent = Pick<RumResourceEvent, CommonProperties | 'resource'>
type PartialRumVitalEvent = Pick<RumVitalEvent, CommonProperties | 'vital'>

export type PartialRumEvent =
  | PartialRumErrorEvent
  | PartialRumResourceEvent
  | PartialRumActionEvent
  | PartialRumLongTaskEvent
  | PartialRumVitalEvent

const allowedEventTypes = ['action', 'error', 'long_task', 'resource', 'vital'] as const

export function startEventCollection(lifeCycle: LifeCycle) {
  return {
    addEvent: (
      startTime: RelativeTime,
      event: PartialRumEvent,
      domainContext: RumEventDomainContext,
      duration?: Duration
    ) => {
      if (!allowedEventTypes.includes(event.type)) {
        return
      }

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        startTime,
        rawRumEvent: event as RawRumEvent,
        domainContext,
        duration,
      })
    },
  }
}
