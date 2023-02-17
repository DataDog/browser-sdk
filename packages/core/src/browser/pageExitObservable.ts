import { isExperimentalFeatureEnabled } from '../domain/configuration'
import { Observable } from '../tools/observable'
import { includes, noop, objectValues } from '../tools/utils'
import { addEventListeners, addEventListener, DOM_EVENT } from './addEventListener'

export const PageExitReason = {
  HIDDEN: 'visibility_hidden',
  UNLOADING: 'before_unload',
  PAGEHIDE: 'page_hide',
  FROZEN: 'page_frozen',
} as const

type PageExitReason = typeof PageExitReason[keyof typeof PageExitReason]

export interface PageExitEvent {
  reason: PageExitReason
}

export function createPageExitObservable(): Observable<PageExitEvent> {
  const observable = new Observable<PageExitEvent>(() => {
    const pagehideEnabled = isExperimentalFeatureEnabled('pagehide')
    const { stop: stopListeners } = addEventListeners(
      window,
      [DOM_EVENT.VISIBILITY_CHANGE, DOM_EVENT.FREEZE, DOM_EVENT.PAGE_HIDE],
      (event) => {
        if (event.type === DOM_EVENT.PAGE_HIDE && pagehideEnabled) {
          /**
           * Only event that detect page unload events while being compatible with the back/forward cache (bfcache)
           */
          observable.notify({ reason: PageExitReason.PAGEHIDE })
        } else if (event.type === DOM_EVENT.VISIBILITY_CHANGE && document.visibilityState === 'hidden') {
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

    let stopBeforeUnloadListener = noop
    if (!pagehideEnabled) {
      stopBeforeUnloadListener = addEventListener(window, DOM_EVENT.BEFORE_UNLOAD, () => {
        observable.notify({ reason: PageExitReason.UNLOADING })
      }).stop
    }

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
