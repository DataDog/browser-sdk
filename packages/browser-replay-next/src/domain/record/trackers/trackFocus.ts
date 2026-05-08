import type { FocusRecord } from '../../../types'
import { RecordType } from '../../../types'
import type { RecordingScope } from '../recordingScope'
import type { EmitRecordCallback } from '../record.types'
import type { Tracker } from './tracker.types'
import { addEventListeners, DOM_EVENT, timeStampNow } from './domUtils'

export function trackFocus(emitRecord: EmitRecordCallback<FocusRecord>, scope: RecordingScope): Tracker {
  return addEventListeners(scope.configuration, window, [DOM_EVENT.FOCUS, DOM_EVENT.BLUR], () => {
    emitRecord({
      data: { has_focus: document.hasFocus() },
      type: RecordType.Focus,
      timestamp: timeStampNow(),
    })
  })
}
