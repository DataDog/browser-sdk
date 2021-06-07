import { monitor, Subscription } from '@datadog/browser-core'

export interface DOMMutationObservable {
  subscribe(callback: () => void): Subscription
}

export function createDOMMutationObservable(): DOMMutationObservable {
  let callbacks: Array<() => void> = []
  const MutationObserver = getMutationObserverConstructor()
  const observer = MutationObserver ? new MutationObserver(monitor(notify)) : undefined

  function notify() {
    callbacks.forEach((callback) => callback())
  }

  function startDOMObservation() {
    if (!observer) {
      return
    }

    observer.observe(document, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    })
  }

  function stopDOMObservation() {
    if (!observer) {
      return
    }

    observer.disconnect()
  }

  return {
    subscribe: (callback) => {
      if (!callbacks.length) {
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

type MutationObserverConstructor = new (callback: MutationCallback) => MutationObserver
interface BrowserWindow extends Window {
  MutationObserver?: MutationObserverConstructor
  Zone?: {
    __symbol__(name: string): string
  }
}

export function getMutationObserverConstructor(): MutationObserverConstructor | undefined {
  let constructor: MutationObserverConstructor | undefined
  const browserWindow: BrowserWindow = window

  // Angular uses Zone.js to provide a context persisting accross async tasks.  Zone.js replaces the
  // global MutationObserver constructor with a patched version to support the context propagation.
  // There is an ongoing issue[1][2] with this setup when using a MutationObserver within a Angular
  // component: on some occasions, the callback is being called in an infinite loop, causing the
  // page to freeze (even if the callback is completely empty).
  //
  // To work around this issue, we are using the Zone __symbol__ API to get the original, unpatched
  // MutationObserver constructor.
  //
  // [1] https://github.com/angular/angular/issues/26948
  // [2] https://github.com/angular/angular/issues/31712
  if (browserWindow.Zone) {
    const symbol = browserWindow.Zone.__symbol__('MutationObserver')
    constructor = browserWindow[symbol as any] as any
  }

  if (!constructor) {
    constructor = browserWindow.MutationObserver
  }

  return constructor
}
