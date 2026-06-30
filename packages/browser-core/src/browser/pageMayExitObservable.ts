import { globalObject, Observable } from '@datadog/js-core/util'
import { addEventListeners, addEventListener, DOM_EVENT } from '@datadog/js-core/dom'
import { PageExitReason } from '@datadog/js-core/transport'
import type { PageMayExitEvent } from '@datadog/js-core/transport'
import { objectValues } from '../tools/utils/polyfills'

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

    /**
     * Emitted only when the page is being terminated (persisted === false), not when entering the
     * back/forward cache. Consumers that must not treat termination like other exits (e.g. Session
     * Replay segment creation reasons) should ignore PAGE_TERMINATED.
     */
    const stopPageHideListener = addEventListener(window, DOM_EVENT.PAGE_HIDE, (event) => {
      if (!event.persisted) {
        observable.notify({ reason: PageExitReason.PAGE_TERMINATED })
      }
    }).stop

    return () => {
      stopListeners()
      stopBeforeUnloadListener()
      stopPageHideListener()
    }
  })
}

export function isPageExitReason(reason: string): reason is PageExitReason {
  return objectValues(PageExitReason).includes(reason as PageExitReason)
}
