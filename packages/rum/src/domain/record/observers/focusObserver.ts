import { DOM_EVENT, addEventListeners } from '@datadog/browser-core'
import type { FocusRecord } from '../../../types'
import type { ListenerHandler } from './utils'

export type FocusCallback = (data: FocusRecord['data']) => void

export function initFocusObserver(focusCb: FocusCallback): ListenerHandler {
  return addEventListeners(window, [DOM_EVENT.FOCUS, DOM_EVENT.BLUR], () => {
    focusCb({ has_focus: document.hasFocus() })
  }).stop
}
