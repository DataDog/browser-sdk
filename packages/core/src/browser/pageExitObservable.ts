import { Observable } from '../tools/observable'
import { objectValues, includes } from '../tools/utils/polyfills'
import type { Configuration } from '../domain/configuration'
import { setTimeout, clearTimeout } from '../tools/timer'
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
    const { stop: stopListeners } = addEventListeners(
      configuration,
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

    const stopBeforeUnloadListener = addEventListener(configuration, window, DOM_EVENT.BEFORE_UNLOAD, () => {
      let isPageExiting = false;

      // Add a listener for the 'unload' event to ensure page is actually exiting
      const handleUnload = () => {
        isPageExiting = true;
        observable.notify({ reason: PageExitReason.UNLOADING });
      };

      // Attach the 'unload' event listener to determine if the page unloads
      addEventListener(configuration, window, DOM_EVENT.UNLOAD, handleUnload);

      // After a short delay, check if the page didn't actually unload
      const timer = setTimeout(() => {
        if (!isPageExiting) {
          // The user stayed on the page, so resume tracking
          // Datadog SDK would continue tracking RUM events
        }
      }, 2000);  // 2 seconds timeout to give user time to interact with beforeUnload dialog

      // Return a cleanup function to remove listeners and clear the timeout
      return () => {
        clearTimeout(timer);  // Clear the timeout if no longer needed
      };
    }).stop;

    return () => {
      stopListeners()
      stopBeforeUnloadListener()
    }
  })
}

export function isPageExitReason(reason: string | undefined): reason is PageExitReason {
  return includes(objectValues(PageExitReason), reason)
}
