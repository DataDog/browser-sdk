import { Observable } from '../tools/observable'
import { includes, objectValues } from '../tools/utils'
import { addEventListener, addEventListeners, DOM_EVENT } from './addEventListener'

export const PageExitReason = {
  HIDDEN: 'visibility_hidden',
  UNLOADING: 'before_unload',
  FROZEN: 'page_frozen',
} as const

type PageExitReason = typeof PageExitReason[keyof typeof PageExitReason]

export interface PageExitEvent {
  reason: PageExitReason
}

export function createPageExitObservable(): Observable<PageExitEvent> {
  const observable = new Observable<PageExitEvent>(() => {
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

    /**
     * Safari does not support yet to send a request during:
     * - a visibility change during doc unload (cf: https://bugs.webkit.org/show_bug.cgi?id=194897)
     * - a page hide transition (cf: https://bugs.webkit.org/show_bug.cgi?id=188329)
     */
    const { stop: stopBeforeUnloadListener } = addEventListener(window, DOM_EVENT.BEFORE_UNLOAD, () => {
      observable.notify({ reason: PageExitReason.UNLOADING })
    })

    return () => {
      stopListeners()
      stopBeforeUnloadListener()
    }
  })

  return observable
}

export function isPageExitReason(reason: string | undefined): reason is PageExitReason {
  return includes(objectValues(PageExitReason), reason)
}
