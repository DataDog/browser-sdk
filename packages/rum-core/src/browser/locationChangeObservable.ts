import { addEventListener, DOM_EVENT, instrumentMethodAndCallOriginal, Observable } from '@datadog/browser-core'

export interface LocationChange {
  oldLocation: Readonly<Location>
  newLocation: Readonly<Location>
}

export function createLocationChangeObservable(location: Location) {
  let currentLocation = { ...location }
  const observable = new Observable<LocationChange>(() => {
    const { stop: stopHistoryTracking } = trackHistory(onLocationChange)
    const { stop: stopHashTracking } = trackHash(onLocationChange)
    return () => {
      stopHistoryTracking()
      stopHashTracking()
    }
  })

  function onLocationChange() {
    if (currentLocation.href === location.href) {
      return
    }
    const newLocation = { ...location }
    observable.notify({
      newLocation,
      oldLocation: currentLocation,
    })
    currentLocation = newLocation
  }

  return observable
}

function trackHistory(onHistoryChange: () => void) {
  const { stop: stopInstrumentingPushState } = instrumentMethodAndCallOriginal(history, 'pushState', {
    after: onHistoryChange,
  })
  const { stop: stopInstrumentingReplaceState } = instrumentMethodAndCallOriginal(history, 'replaceState', {
    after: onHistoryChange,
  })
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
