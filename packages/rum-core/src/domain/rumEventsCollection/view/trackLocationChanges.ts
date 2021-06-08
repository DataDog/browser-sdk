import { monitor, addEventListener, DOM_EVENT } from '@datadog/browser-core'

export function trackLocationChanges(onLocationChange: () => void) {
  const { stop: stopHistoryTracking } = trackHistory(onLocationChange)
  const { stop: stopHashTracking } = trackHash(onLocationChange)

  return {
    stop: () => {
      stopHistoryTracking()
      stopHashTracking()
    },
  }
}

export function areDifferentLocation(currentLocation: Location, otherLocation: Location) {
  return (
    currentLocation.pathname !== otherLocation.pathname ||
    (!isHashAnAnchor(otherLocation.hash) &&
      getPathFromHash(otherLocation.hash) !== getPathFromHash(currentLocation.hash))
  )
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

function isHashAnAnchor(hash: string) {
  const correspondingId = hash.substr(1)
  return !!document.getElementById(correspondingId)
}

function getPathFromHash(hash: string) {
  const index = hash.indexOf('?')
  return index < 0 ? hash : hash.slice(0, index)
}
