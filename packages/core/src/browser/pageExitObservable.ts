import { isExperimentalFeatureEnabled, ExperimentalFeature } from '../tools/experimentalFeatures'
import { Observable } from '../tools/observable'
import { objectValues, includes } from '../tools/utils/polyfills'
import { noop } from '../tools/utils/functionUtils'
import type { Configuration } from '../domain/configuration'
import { addEventListeners, addEventListener, DOM_EVENT } from './addEventListener'

export const PageExitReason = {
  HIDDEN: 'visibility_hidden',
  UNLOADING: 'before_unload',
  PAGEHIDE: 'page_hide',
  FROZEN: 'page_frozen',
} as const

export type PageExitReason = (typeof PageExitReason)[keyof typeof PageExitReason]

export interface PageExitEvent {
  reason: PageExitReason
}

export function createPageExitObservable(configuration: Configuration): Observable<PageExitEvent> {
  return new Observable<PageExitEvent>((observable) => {
    const pagehideEnabled = isExperimentalFeatureEnabled(ExperimentalFeature.PAGEHIDE)
    const { stop: stopListeners } = addEventListeners(
      configuration,
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
      stopBeforeUnloadListener = addEventListener(configuration, window, DOM_EVENT.BEFORE_UNLOAD, () => {
        observable.notify({ reason: PageExitReason.UNLOADING })
      }).stop
    }

    return () => {
      stopListeners()
      stopBeforeUnloadListener()
    }
  })
}

export function isPageExitReason(reason: string | undefined): reason is PageExitReason {
  return includes(objectValues(PageExitReason), reason)
}
