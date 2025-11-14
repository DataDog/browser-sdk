import { timeStampNow } from '@datadog/browser-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import { RecordType } from '../../../types'
import type { SerializationScope } from '../serialization'
import type { Tracker } from './tracker.types'

export function trackViewEnd(lifeCycle: LifeCycle, scope: SerializationScope, flushMutations: () => void): Tracker {
  const viewEndSubscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, () => {
    flushMutations()
    scope.captureEvent(() => ({
      timestamp: timeStampNow(),
      type: RecordType.ViewEnd,
    }))
  })

  return {
    stop: () => {
      viewEndSubscription.unsubscribe()
    },
  }
}
