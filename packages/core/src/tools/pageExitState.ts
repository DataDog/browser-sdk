import type { Subscription } from './observable'
import { Observable } from './observable'
import { addEventListener, DOM_EVENT } from './utils'

export interface PageExitState {
  onPageExit: (callback: (event: PageExitEvent) => void) => Subscription
  stop: () => void
}

export interface PageExitEvent {
  isUnloading: boolean
}

const enum PageExitStatus {
  NOT_EXITED,
  EXITED_HIDDEN,
  EXITED_UNLOADING,
}

export function createPageExitState(): PageExitState {
  let status = PageExitStatus.NOT_EXITED
  const onPageExitObservable = new Observable<PageExitEvent>()

  function setUnloadStatus(newUnloadStatus: PageExitStatus) {
    if (status === PageExitStatus.EXITED_UNLOADING || status === newUnloadStatus) {
      return
    }

    status = newUnloadStatus

    if (isExited()) {
      onPageExitObservable.notify({ isUnloading: status === PageExitStatus.EXITED_UNLOADING })
    }
  }

  function isExited() {
    return status !== PageExitStatus.NOT_EXITED
  }

  /**
   * Only event that guarantee to fire on mobile devices when the page transitions to background state
   * (e.g. when user switches to a different application, goes to homescreen, etc), or is being unloaded.
   */
  const { stop: stopVisibilityChangeListener } = addEventListener(document, DOM_EVENT.VISIBILITY_CHANGE, () => {
    setUnloadStatus(document.visibilityState === 'hidden' ? PageExitStatus.EXITED_HIDDEN : PageExitStatus.NOT_EXITED)
  })

  /**
   * Safari does not support yet to send a request during:
   * - a visibility change during doc unload (cf: https://bugs.webkit.org/show_bug.cgi?id=194897)
   * - a page hide transition (cf: https://bugs.webkit.org/show_bug.cgi?id=188329)
   */
  const { stop: stopUnloadListener } = addEventListener(window, DOM_EVENT.BEFORE_UNLOAD, () => {
    setUnloadStatus(PageExitStatus.EXITED_UNLOADING)
  })

  return {
    onPageExit: (callback) => onPageExitObservable.subscribe(callback),
    stop: () => {
      stopVisibilityChangeListener()
      stopUnloadListener()
    },
  }
}
