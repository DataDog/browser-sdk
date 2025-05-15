import { addEventListener, DOM_EVENT, instrumentMethod, Observable, shallowClone } from '@flashcatcloud/browser-core'
import type { RumConfiguration } from '../domain/configuration'

export interface LocationChange {
  oldLocation: Readonly<Location>
  newLocation: Readonly<Location>
}

export function createLocationChangeObservable(configuration: RumConfiguration, location: Location) {
  let currentLocation = shallowClone(location)

  return new Observable<LocationChange>((observable) => {
    const { stop: stopHistoryTracking } = trackHistory(configuration, onLocationChange)
    const { stop: stopHashTracking } = trackHash(configuration, onLocationChange)

    function onLocationChange() {
      if (currentLocation.href === location.href) {
        return
      }
      const newLocation = shallowClone(location)
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

function trackHistory(configuration: RumConfiguration, onHistoryChange: () => void) {
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
  const { stop: removeListener } = addEventListener(configuration, window, DOM_EVENT.POP_STATE, onHistoryChange)

  return {
    stop: () => {
      stopInstrumentingPushState()
      stopInstrumentingReplaceState()
      removeListener()
    },
  }
}

function trackHash(configuration: RumConfiguration, onHashChange: () => void) {
  return addEventListener(configuration, window, DOM_EVENT.HASH_CHANGE, onHashChange)
}

function getHistoryInstrumentationTarget(methodName: 'pushState' | 'replaceState') {
  // Ideally we should always instument the method on the prototype, however some frameworks (e.g [Next.js](https://github.com/vercel/next.js/blob/d3f5532065f3e3bb84fb54bd2dfd1a16d0f03a21/packages/next/src/client/components/app-router.tsx#L429))
  // are wrapping the instance method. In that case we should also wrap the instance method.
  return Object.prototype.hasOwnProperty.call(history, methodName) ? history : History.prototype
}
