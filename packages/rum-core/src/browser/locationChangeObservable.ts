import { addEventListener, DOM_EVENT, instrumentMethod, Observable, shallowClone } from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'

export interface LocationChange {
  oldLocation: Readonly<Location>
  newLocation: Readonly<Location>
}

export function createLocationChangeObservable(configuration: RumConfiguration, location: Location) {
  let currentLocation = shallowClone(location)

  return new Observable<LocationChange>((observable) => {
    const stopHistoryTracking = trackHistory(configuration, onLocationChange)
    const stopHashTracking = trackHash(configuration, onLocationChange)

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
  const stopInstrumentingPushState = instrumentMethod(history, 'pushState', ({ onPostCall }) => {
    onPostCall(onHistoryChange)
  })
  const stopInstrumentingReplaceState = instrumentMethod(history, 'replaceState', ({ onPostCall }) => {
    onPostCall(onHistoryChange)
  })
  const removeListener = addEventListener(configuration, window, DOM_EVENT.POP_STATE, onHistoryChange)

  return () => {
    stopInstrumentingPushState()
    stopInstrumentingReplaceState()
    removeListener()
  }
}

function trackHash(configuration: RumConfiguration, onHashChange: () => void) {
  return addEventListener(configuration, window, DOM_EVENT.HASH_CHANGE, onHashChange)
}
