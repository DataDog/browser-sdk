import { registerCleanupTask } from '@datadog/browser-core/test'
import type { LifeCycle, RawRumEventCollectedData } from '../src/domain/lifeCycle'
import { LifeCycleEventType } from '../src/domain/lifeCycle'
import type { RawRumEvent } from '../src/rawRumEvent.types'

export function collectAndValidateRawRumEvents(lifeCycle: LifeCycle) {
  const rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>> = []
  const subscription = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (data) => {
    rawRumEvents.push(data)
  })
  registerCleanupTask(() => {
    subscription.unsubscribe()
  })

  return rawRumEvents
}
