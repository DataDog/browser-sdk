import { monitor, addEventListener, DOM_EVENT, Observable } from '@datadog/browser-core'

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
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalPushState = history.pushState
  history.pushState = monitor(function (this: History['pushState']) {
    originalPushState.apply(this, arguments as any)
    onHistoryChange()
  })
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalReplaceState = history.replaceState
  history.replaceState = monitor(function (this: History['replaceState']) {
    originalReplaceState.apply(this, arguments as any)
    onHistoryChange()
  })
  const { stop: removeListener } = addEventListener(window, DOM_EVENT.POP_STATE, onHistoryChange)
  const stop = () => {
    removeListener()
    history.pushState = originalPushState
    history.replaceState = originalReplaceState
  }
  return { stop }
}

function trackHash(onHashChange: () => void) {
  return addEventListener(window, DOM_EVENT.HASH_CHANGE, onHashChange)
}
