import type { LifeCycle } from '@datadog/browser-rum-core'
import { ActionType, RumEventType, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { FrustrationRecord } from '../../../types'
import { RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import type { RecordingScope } from '../recordingScope'
import type { Tracker } from './tracker.types'

export function trackFrustration(
  lifeCycle: LifeCycle,
  emitRecord: EmitRecordCallback<FrustrationRecord>,
  scope: RecordingScope
): Tracker {
  const frustrationSubscription = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (data) => {
    if (
      data.rawRumEvent.type === RumEventType.ACTION &&
      data.rawRumEvent.action.type === ActionType.CLICK &&
      data.rawRumEvent.action.frustration?.type?.length &&
      'events' in data.domainContext &&
      data.domainContext.events &&
      data.domainContext.events.length
    ) {
      emitRecord({
        timestamp: data.rawRumEvent.date,
        type: RecordType.FrustrationRecord,
        data: {
          frustrationTypes: data.rawRumEvent.action.frustration.type,
          recordIds: data.domainContext.events.map((e) => scope.eventIds.getOrInsert(e)),
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
