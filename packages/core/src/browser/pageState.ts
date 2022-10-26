import type { Subscription } from '../tools/observable'
import { Observable } from '../tools/observable'
import { addEventListener, DOM_EVENT } from '../tools/utils'

export interface PageState {
  onExit: (callback: (event: PageExitEvent) => void) => Subscription
  stop: () => void
}

export interface PageExitEvent {
  isUnloading: boolean
}

const enum PageStatus {
  VISIBLE,
  HIDDEN,
  UNLOADING,
}

export function createPageState(): PageState {
  let currentStatus = PageStatus.VISIBLE
  const onExitObservable = new Observable<PageExitEvent>()

  function setStatus(newStatus: PageStatus) {
    if (currentStatus === PageStatus.UNLOADING && newStatus !== PageStatus.UNLOADING) {
      return
    }

    currentStatus = newStatus

    if (isExited()) {
      onExitObservable.notify({ isUnloading: currentStatus === PageStatus.UNLOADING })
    }
  }

  function isExited() {
    return currentStatus !== PageStatus.VISIBLE
  }

  /**
   * Only event that guarantee to fire on mobile devices when the page transitions to background state
   * (e.g. when user switches to a different application, goes to homescreen, etc), or is being unloaded.
   */
  const { stop: stopVisibilityChangeListener } = addEventListener(document, DOM_EVENT.VISIBILITY_CHANGE, () => {
    setStatus(document.visibilityState === 'hidden' ? PageStatus.HIDDEN : PageStatus.VISIBLE)
  })

  /**
   * Safari does not support yet to send a request during:
   * - a visibility change during doc unload (cf: https://bugs.webkit.org/show_bug.cgi?id=194897)
   * - a page hide transition (cf: https://bugs.webkit.org/show_bug.cgi?id=188329)
   */
  const { stop: stopUnloadListener } = addEventListener(window, DOM_EVENT.BEFORE_UNLOAD, () => {
    setStatus(PageStatus.UNLOADING)
  })

  return {
    onExit: (callback) => onExitObservable.subscribe(callback),
    stop: () => {
      stopVisibilityChangeListener()
      stopUnloadListener()
    },
  }
}
