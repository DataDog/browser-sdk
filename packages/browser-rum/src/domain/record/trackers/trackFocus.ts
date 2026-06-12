import { DOM_EVENT, addEventListeners } from '@datadog/browser-core'
import { timeStampNow } from '@datadog/js-core/time'
import type { FocusRecord } from '../../../types'
import { RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import type { Tracker } from './tracker.types'

export function trackFocus(emitRecord: EmitRecordCallback<FocusRecord>): Tracker {
  return addEventListeners(window, [DOM_EVENT.FOCUS, DOM_EVENT.BLUR], () => {
    emitRecord({
      data: { has_focus: document.hasFocus() },
      type: RecordType.Focus,
      timestamp: timeStampNow(),
    })
  })
}
