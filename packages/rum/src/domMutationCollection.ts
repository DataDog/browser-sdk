import { LifeCycle, LifeCycleEventType } from './lifeCycle'

interface BrowserWindow extends Window {
  MutationObserver?: MutationObserver
}

export function startDOMMutationCollection(lifeCycle: LifeCycle) {
  if ((window as BrowserWindow).MutationObserver) {
    const observer = new MutationObserver(() => {
      lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    })

    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    })
  }
}
