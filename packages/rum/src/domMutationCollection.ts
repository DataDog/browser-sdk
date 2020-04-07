import { monitor } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'

interface BrowserWindow extends Window {
  MutationObserver?: MutationObserver
}

export function startDOMMutationCollection(lifeCycle: LifeCycle) {
  let observer: MutationObserver | undefined
  if ((window as BrowserWindow).MutationObserver) {
    observer = new MutationObserver(
      monitor(() => {
        lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
      })
    )

    observer.observe(document.documentElement, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    })
  }

  return {
    stop() {
      if (observer) {
        observer.disconnect()
      }
    },
  }
}
