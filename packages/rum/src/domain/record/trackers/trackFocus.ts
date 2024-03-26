import { DOM_EVENT, addEventListeners, timeStampNow } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { RecordType, type FocusRecord } from '../../../types'
import type { Tracker } from './types'

export type FocusCallback = (data: FocusRecord) => void

export function trackFocus(configuration: RumConfiguration, focusCb: FocusCallback): Tracker {
  return addEventListeners(configuration, window, [DOM_EVENT.FOCUS, DOM_EVENT.BLUR], () => {
    focusCb({
      data: { has_focus: document.hasFocus() },
      type: RecordType.Focus,
      timestamp: timeStampNow(),
    })
  })
}
