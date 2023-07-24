import type { ListenerHandler } from '@datadog/browser-core'
import { DOM_EVENT, addEventListeners } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { FocusRecord } from '../../../types'

export type FocusCallback = (data: FocusRecord['data']) => void

export function initFocusObserver(configuration: RumConfiguration, focusCb: FocusCallback): ListenerHandler {
  return addEventListeners(configuration, window, [DOM_EVENT.FOCUS, DOM_EVENT.BLUR], () => {
    focusCb({ has_focus: document.hasFocus() })
  }).stop
}
