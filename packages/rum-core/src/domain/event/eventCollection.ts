import type { Duration, RelativeTime } from '@datadog/browser-core'
import type { RumEventDomainContext } from '../../domainContext.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RumEvent, CommonProperties } from '../../rumEvent.types'
import type { RawRumEvent } from '../../rawRumEvent.types'

export function startEventCollection(lifeCycle: LifeCycle) {
  return {
    addEvent: (
      startTime: RelativeTime,
      event: Omit<RumEvent, keyof CommonProperties>,
      domainContext: RumEventDomainContext,
      duration?: Duration
    ) =>
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        startTime,
        rawRumEvent: event as RawRumEvent, // TODO fix typings
        domainContext,
        duration,
      }),
  }
}
