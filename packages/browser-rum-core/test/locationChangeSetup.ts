import { buildLocation, replaceMockable } from '@datadog/browser-core/test'
import { globalObject, Observable } from '@datadog/browser-core'
import type { LocationChange } from '../src/browser/locationChangeObservable'

export function setupLocationObserver(initialLocation?: string) {
  const fakeLocation = initialLocation ? buildLocation(initialLocation) : globalObject.location
  const locationChangeObservable = new Observable<LocationChange>()

  replaceMockable(globalObject.location, fakeLocation)

  function changeLocation(to: string) {
    const currentLocation = { ...fakeLocation }
    Object.assign(fakeLocation, buildLocation(to, fakeLocation.href))
    locationChangeObservable.notify({
      oldLocation: currentLocation,
      newLocation: fakeLocation,
    })
  }

  return { locationChangeObservable, changeLocation }
}
