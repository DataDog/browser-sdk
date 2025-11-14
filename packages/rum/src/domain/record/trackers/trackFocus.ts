import { DOM_EVENT, addEventListeners, timeStampNow } from '@datadog/browser-core'
import { RecordType } from '../../../types'
import type { SerializationScope } from '../serialization'
import type { Tracker } from './tracker.types'

export function trackFocus(scope: SerializationScope): Tracker {
  return addEventListeners(scope.configuration, window, [DOM_EVENT.FOCUS, DOM_EVENT.BLUR], () => {
    scope.captureEvent(() => ({
      data: { has_focus: document.hasFocus() },
      type: RecordType.Focus,
      timestamp: timeStampNow(),
    }))
  })
}
