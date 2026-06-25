import {
  addEventListener,
  DOM_EVENT,
  globalObject,
  instrumentMethod,
  mockable,
  Observable,
  shallowClone,
} from '@datadog/browser-core'

export interface LocationChange {
  oldLocation: Readonly<Location>
  newLocation: Readonly<Location>
}

export function createLocationChangeObservable() {
  let currentLocation = shallowClone(getLocation())

  return new Observable<LocationChange>((observable) => {
    const { stop: stopHistoryTracking } = trackHistory(onLocationChange)
    const { stop: stopHashTracking } = trackHash(onLocationChange)

    function onLocationChange() {
      if (currentLocation.href === getLocation().href) {
        return
      }
      const newLocation = shallowClone(getLocation())
      observable.notify({
        newLocation,
        oldLocation: currentLocation,
      })
      currentLocation = newLocation
    }

    return () => {
      stopHistoryTracking()
      stopHashTracking()
    }
  })
}

function getLocation() {
  return mockable(globalObject.location)
}

function trackHistory(onHistoryChange: () => void) {
  const { stop: stopInstrumentingPushState } = instrumentMethod(
    getHistoryInstrumentationTarget('pushState'),
    'pushState',
    ({ onPostCall }) => {
      onPostCall(onHistoryChange)
    }
  )
  const { stop: stopInstrumentingReplaceState } = instrumentMethod(
    getHistoryInstrumentationTarget('replaceState'),
    'replaceState',
    ({ onPostCall }) => {
      onPostCall(onHistoryChange)
    }
  )
  const { stop: removeListener } = addEventListener(window, DOM_EVENT.POP_STATE, onHistoryChange)

  return {
    stop: () => {
      stopInstrumentingPushState()
      stopInstrumentingReplaceState()
      removeListener()
    },
  }
}

function trackHash(onHashChange: () => void) {
  return addEventListener(window, DOM_EVENT.HASH_CHANGE, onHashChange)
}

function getHistoryInstrumentationTarget(methodName: 'pushState' | 'replaceState') {
  // Ideally we should always instument the method on the prototype, however some frameworks (e.g [Next.js](https://github.com/vercel/next.js/blob/d3f5532065f3e3bb84fb54bd2dfd1a16d0f03a21/packages/next/src/client/components/app-router.tsx#L429))
  // are wrapping the instance method. In that case we should also wrap the instance method.
  return Object.prototype.hasOwnProperty.call(history, methodName) ? history : History.prototype
}
