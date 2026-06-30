import { globalObject } from '@datadog/js-core/util'
import { PageExitReason } from '@datadog/js-core/transport'
import type { PageMayExitEvent } from '@datadog/js-core/transport'
import { Observable } from '../tools/observable'
import { addEventListeners, addEventListener, DOM_EVENT } from './addEventListener'

export { PageExitReason, isPageExitReason } from '@datadog/js-core/transport'
export type { PageMayExitEvent } from '@datadog/js-core/transport'

export function createPageMayExitObservable(): Observable<PageMayExitEvent> {
  return new Observable<PageMayExitEvent>((observable) => {
    const window = globalObject.window
    if (!window) {
      // Page exit is not observable in non-browser environments
      return
    }
    const { stop: stopListeners } = addEventListeners(
      window,
      [DOM_EVENT.VISIBILITY_CHANGE, DOM_EVENT.FREEZE],
      (event) => {
        if (event.type === DOM_EVENT.VISIBILITY_CHANGE && document.visibilityState === 'hidden') {
          /**
           * Only event that guarantee to fire on mobile devices when the page transitions to background state
           * (e.g. when user switches to a different application, goes to homescreen, etc), or is being unloaded.
           */
          observable.notify({ reason: PageExitReason.HIDDEN })
        } else if (event.type === DOM_EVENT.FREEZE) {
          /**
           * After transitioning in background a tab can be freezed to preserve resources. (cf: https://developer.chrome.com/blog/page-lifecycle-api)
           * Allow to collect events happening between hidden and frozen state.
           */
          observable.notify({ reason: PageExitReason.FROZEN })
        }
      },
      { capture: true }
    )

    const stopBeforeUnloadListener = addEventListener(window, DOM_EVENT.BEFORE_UNLOAD, () => {
      observable.notify({ reason: PageExitReason.UNLOADING })
    }).stop

    return () => {
      stopListeners()
      stopBeforeUnloadListener()
    }
  })
}


