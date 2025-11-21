import { DOM_EVENT, addEventListeners, timeStampNow } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { FocusRecord } from '../../../types'
import { RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import type { Tracker } from './tracker.types'

export type FocusCallback = (data: FocusRecord) => void

export function trackFocus(configuration: RumConfiguration, emitRecord: EmitRecordCallback<FocusRecord>): Tracker {
  return addEventListeners(configuration, window, [DOM_EVENT.FOCUS, DOM_EVENT.BLUR], () => {
    emitRecord({
      data: { has_focus: document.hasFocus() },
      type: RecordType.Focus,
      timestamp: timeStampNow(),
    })
  })
}
