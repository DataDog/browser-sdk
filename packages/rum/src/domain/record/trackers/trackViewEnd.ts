import { timeStampNow } from '@datadog/browser-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import type { ViewEndRecord } from '../../../types'
import { RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import type { Tracker } from './tracker.types'

export function trackViewEnd(
  lifeCycle: LifeCycle,
  emitRecord: EmitRecordCallback<ViewEndRecord>,
  flushMutations: () => void
): Tracker {
  const viewEndSubscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, () => {
    flushMutations()
    emitRecord({
      timestamp: timeStampNow(),
      type: RecordType.ViewEnd,
    })
  })

  return {
    stop: () => {
      viewEndSubscription.unsubscribe()
    },
  }
}
