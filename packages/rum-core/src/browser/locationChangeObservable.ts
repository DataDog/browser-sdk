import { addEventListener, DOM_EVENT, instrumentMethod, Observable, shallowClone } from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'

export interface LocationChange {
  oldLocation: Readonly<Location>
  newLocation: Readonly<Location>
}

export function createLocationChangeObservable(configuration: RumConfiguration) {
  let currentLocation = getLocationSnapshot()

  return new Observable<LocationChange>((observable) => {
    const { stop: stopHistoryTracking } = trackHistory(configuration, onLocationChange)
    const { stop: stopHashTracking } = trackHash(configuration, onLocationChange)

    function onLocationChange() {
      const nextLocation = getLocationSnapshot()
      if (currentLocation.href === nextLocation.href) {
        return
      }
      observable.notify({
        newLocation: nextLocation,
        oldLocation: currentLocation,
      })
      currentLocation = nextLocation
    }

    return () => {
      stopHistoryTracking()
      stopHashTracking()
    }
  })
}

function getLocationSnapshot(): Readonly<Location> {
  const currentLocation = window.location
  return shallowClone({
    ancestorOrigins: currentLocation?.ancestorOrigins,
    hash: currentLocation?.hash ?? '',
    host: currentLocation?.host ?? '',
    hostname: currentLocation?.hostname ?? '',
    href: currentLocation?.href ?? 'about:blank',
    origin: currentLocation?.origin ?? '',
    pathname: currentLocation?.pathname ?? '/',
    port: currentLocation?.port ?? '',
    protocol: currentLocation?.protocol ?? '',
    search: currentLocation?.search ?? '',
  }) as unknown as Readonly<Location>
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
