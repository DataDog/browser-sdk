import { buildLocation } from '@datadog/browser-core/test'
import { assign, Observable } from '@datadog/browser-core'
import type { LocationChange } from '../src/browser/locationChangeObservable'

export function setupLocationObserver(initialLocation?: string) {
  const fakeLocation = initialLocation ? buildLocation(initialLocation) : location
  const locationChangeObservable = new Observable<LocationChange>()

  function changeLocation(to: string) {
    const currentLocation = { ...fakeLocation }
    assign(fakeLocation, buildLocation(to, fakeLocation.href))
    locationChangeObservable.notify({
      oldLocation: currentLocation as Location,
      newLocation: fakeLocation,
    })
  }

  return { fakeLocation, locationChangeObservable, changeLocation }
}
