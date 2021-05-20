import { Subscription } from '../domain/lifeCycle'

export interface DOMMutation {
  notify(): void

  subscribe(callback: () => void): Subscription
}

export function createDOMMutationObservable(): DOMMutation {
  let callbacks: Array<() => void> = []

  const observer = new MutationObserver(notify)
  let isDOMObserved = false

  function notify() {
    callbacks.forEach((callback) => callback())
  }

  function startDOMObservation() {
    observer.observe(document, {
      attributeOldValue: true,
      attributes: true,
      characterData: true,
      characterDataOldValue: true,
      childList: true,
      subtree: true,
    })
    isDOMObserved = true
  }

  function stopDOMObservation() {
    observer.disconnect()
    isDOMObserved = false
  }

  return {
    notify,
    subscribe: (callback) => {
      if (!isDOMObserved) {
        startDOMObservation()
      }

      callbacks.push(callback)
      return {
        unsubscribe: () => {
          callbacks = callbacks.filter((other) => callback !== other)

          if (!callbacks.length) {
            stopDOMObservation()
          }
        },
      }
    },
  }
}
