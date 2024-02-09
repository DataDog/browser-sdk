import { timeStampNow, type ListenerHandler } from '@datadog/browser-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import type { ViewEndRecord } from '../../../types'
import { RecordType } from '../../../types'

export type ViewEndCallback = (record: ViewEndRecord) => void

export function initViewEndObserver(lifeCycle: LifeCycle, viewEndCb: ViewEndCallback): ListenerHandler {
  return lifeCycle.subscribe(LifeCycleEventType.BEFORE_VIEW_ENDED, () => {
    viewEndCb({
      timestamp: timeStampNow(),
      type: RecordType.ViewEnd,
    })
  }).unsubscribe
}
