import type { LifeCycle } from '@datadog/browser-rum-core'
import { ActionType, RumEventType, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { FrustrationRecord } from '../../../types'
import { RecordType } from '../../../types'
import type { RecordIds } from '../recordIds'
import type { Tracker } from './types'

export type FrustrationCallback = (record: FrustrationRecord) => void

export function trackFrustration(
  lifeCycle: LifeCycle,
  frustrationCb: FrustrationCallback,
  recordIds: RecordIds
): Tracker {
  const frustrationSubscription = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (data) => {
    if (
      data.rawRumEvent.type === RumEventType.ACTION &&
      data.rawRumEvent.action.type === ActionType.CLICK &&
      data.rawRumEvent.action.frustration?.type?.length &&
      'events' in data.domainContext &&
      data.domainContext.events?.length
    ) {
      frustrationCb({
        timestamp: data.rawRumEvent.date,
        type: RecordType.FrustrationRecord,
        data: {
          frustrationTypes: data.rawRumEvent.action.frustration.type,
          recordIds: data.domainContext.events.map((e) => recordIds.getIdForEvent(e)),
        },
      })
    }
  })

  return {
    stop: () => {
      frustrationSubscription.unsubscribe()
    },
  }
}
