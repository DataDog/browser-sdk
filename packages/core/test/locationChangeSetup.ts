import type { LocationChange } from '@datadog/browser-core/src/browser/locationChangeObservable'
import { Observable } from '../src/tools/observable'
import { buildLocation } from './emulate/buildLocation'

export function setupLocationObserver(initialLocation?: string) {
  const fakeLocation = initialLocation ? buildLocation(initialLocation) : location
  const locationChangeObservable = new Observable<LocationChange>()

  function changeLocation(to: string) {
    const currentLocation = { ...fakeLocation }
    Object.assign(fakeLocation, buildLocation(to, fakeLocation.href))
    locationChangeObservable.notify({
      oldLocation: currentLocation as Location,
      newLocation: fakeLocation,
    })
  }

  return { fakeLocation, locationChangeObservable, changeLocation }
}
