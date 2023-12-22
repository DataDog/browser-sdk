import { monitor, noop, Observable, getZoneJsOriginalValue } from '@datadog/browser-core'

export function createDOMMutationObservable() {
  const MutationObserver = getMutationObserverConstructor()

  return new Observable<void>((observable) => {
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
}

type MutationObserverConstructor = new (callback: MutationCallback) => MutationObserver

export interface BrowserWindow extends Window {
  MutationObserver?: MutationObserverConstructor
  Zone?: unknown
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
  // To work around this issue, we try to get the original MutationObserver constructor stored by
  // Zone.js.
  //
  // [1] https://github.com/angular/angular/issues/26948
  // [2] https://github.com/angular/angular/issues/31712
  if (browserWindow.Zone) {
    // Zone.js 0.8.6+ is storing original class constructors into the browser 'window' object[3].
    //
    // [3] https://github.com/angular/angular/blob/6375fa79875c0fe7b815efc45940a6e6f5c9c9eb/packages/zone.js/lib/common/utils.ts#L288
    constructor = getZoneJsOriginalValue(browserWindow, 'MutationObserver')

    if (browserWindow.MutationObserver && constructor === browserWindow.MutationObserver) {
      // Anterior Zone.js versions (used in Angular 2) does not expose the original MutationObserver
      // in the 'window' object. Luckily, the patched MutationObserver class is storing an original
      // instance in its properties[4]. Let's get the original MutationObserver constructor from
      // there.
      //
      // [4] https://github.com/angular/zone.js/blob/v0.8.5/lib/common/utils.ts#L412

      const patchedInstance = new browserWindow.MutationObserver(noop) as {
        originalInstance?: { constructor: MutationObserverConstructor }
      }

      const originalInstance = getZoneJsOriginalValue(patchedInstance, 'originalInstance')
      constructor = originalInstance && originalInstance.constructor
    }
  }

  if (!constructor) {
    constructor = browserWindow.MutationObserver
  }

  return constructor
}
