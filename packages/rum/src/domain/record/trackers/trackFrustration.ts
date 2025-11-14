import type { LifeCycle } from '@datadog/browser-rum-core'
import { ActionType, RumEventType, LifeCycleEventType } from '@datadog/browser-rum-core'
import { RecordType } from '../../../types'
import type { SerializationScope } from '../serialization'
import type { Tracker } from './tracker.types'

export function trackFrustration(lifeCycle: LifeCycle, scope: SerializationScope): Tracker {
  const frustrationSubscription = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (data) => {
    scope.captureEvent(() => {
      if (
        data.rawRumEvent.type === RumEventType.ACTION &&
        data.rawRumEvent.action.type === ActionType.CLICK &&
        data.rawRumEvent.action.frustration?.type?.length &&
        'events' in data.domainContext &&
        data.domainContext.events &&
        data.domainContext.events.length
      ) {
        return {
          timestamp: data.rawRumEvent.date,
          type: RecordType.FrustrationRecord,
          data: {
            frustrationTypes: data.rawRumEvent.action.frustration.type,
            recordIds: data.domainContext.events.map((e) => scope.eventIds.getIdForEvent(e)),
          },
        }
      }
    })
  })

  return {
    stop: () => {
      frustrationSubscription.unsubscribe()
    },
  }
}
