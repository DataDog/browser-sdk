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
  NOT_EXITED,
  EXITED_HIDDEN,
  EXITED_UNLOADING,
}

export function createPageState(): PageState {
  let status = PageStatus.NOT_EXITED
  const onExitObservable = new Observable<PageExitEvent>()

  function setUnloadStatus(newUnloadStatus: PageStatus) {
    if (status === PageStatus.EXITED_UNLOADING || status === newUnloadStatus) {
      return
    }

    status = newUnloadStatus

    if (isExited()) {
      onExitObservable.notify({ isUnloading: status === PageStatus.EXITED_UNLOADING })
    }
  }

  function isExited() {
    return status !== PageStatus.NOT_EXITED
  }

  /**
   * Only event that guarantee to fire on mobile devices when the page transitions to background state
   * (e.g. when user switches to a different application, goes to homescreen, etc), or is being unloaded.
   */
  const { stop: stopVisibilityChangeListener } = addEventListener(document, DOM_EVENT.VISIBILITY_CHANGE, () => {
    setUnloadStatus(document.visibilityState === 'hidden' ? PageStatus.EXITED_HIDDEN : PageStatus.NOT_EXITED)
  })

  /**
   * Safari does not support yet to send a request during:
   * - a visibility change during doc unload (cf: https://bugs.webkit.org/show_bug.cgi?id=194897)
   * - a page hide transition (cf: https://bugs.webkit.org/show_bug.cgi?id=188329)
   */
  const { stop: stopUnloadListener } = addEventListener(window, DOM_EVENT.BEFORE_UNLOAD, () => {
    setUnloadStatus(PageStatus.EXITED_UNLOADING)
  })

  return {
    onExit: (callback) => onExitObservable.subscribe(callback),
    stop: () => {
      stopVisibilityChangeListener()
      stopUnloadListener()
    },
  }
}
