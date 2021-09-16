import { monitor, Observable } from '@datadog/browser-core'

export function createDOMMutationObservable() {
  const MutationObserver = getMutationObserverConstructor()

  const observable: Observable<void> = new Observable<void>(() => {
    if (!MutationObserver) {
      return
    }
    const observer = new MutationObserver(monitor(() => observable.notify()))
    observer.observe(document, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    })
    return () => observer.disconnect()
  })

  return observable
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

  // Angular uses Zone.js to provide a context persisting across async tasks.  Zone.js replaces the
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
