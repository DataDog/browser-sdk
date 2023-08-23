import {
  addEventListener,
  DOM_EVENT,
  instrumentMethodAndCallOriginal,
  Observable,
  shallowClone,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'

export interface LocationChange {
  oldLocation: Readonly<Location>
  newLocation: Readonly<Location>
}

export function createLocationChangeObservable(configuration: RumConfiguration, location: Location) {
  let currentLocation = shallowClone(location)
  const observable = new Observable<LocationChange>(() => {
    const { stop: stopHistoryTracking } = trackHistory(configuration, onLocationChange)
    const { stop: stopHashTracking } = trackHash(configuration, onLocationChange)
    return () => {
      stopHistoryTracking()
      stopHashTracking()
    }
  })

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

  return observable
}

function trackHistory(configuration: RumConfiguration, onHistoryChange: () => void) {
  const { stop: stopInstrumentingPushState } = instrumentMethodAndCallOriginal(history, 'pushState', {
    after: onHistoryChange,
  })
  const { stop: stopInstrumentingReplaceState } = instrumentMethodAndCallOriginal(history, 'replaceState', {
    after: onHistoryChange,
  })
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
