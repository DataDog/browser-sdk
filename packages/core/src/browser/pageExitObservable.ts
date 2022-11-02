import { Observable } from '../tools/observable'
import { addEventListener, DOM_EVENT } from '../tools/utils'

export const enum PageExitReason {
  HIDDEN,
  UNLOADING,
}

export interface PageExitEvent {
  reason: PageExitReason
}

export function createPageExitObservable(): Observable<PageExitEvent> {
  const observable = new Observable<PageExitEvent>(() => {
    /**
     * Only event that guarantee to fire on mobile devices when the page transitions to background state
     * (e.g. when user switches to a different application, goes to homescreen, etc), or is being unloaded.
     */
    const { stop: stopVisibilityChangeListener } = addEventListener(
      document,
      DOM_EVENT.VISIBILITY_CHANGE,
      () => {
        if (document.visibilityState === 'hidden') {
          observable.notify({ reason: PageExitReason.HIDDEN })
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
      stopVisibilityChangeListener()
      stopBeforeUnloadListener()
    }
  })

  return observable
}
