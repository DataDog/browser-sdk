import type { Observable, Subscription } from '@datadog/browser-core'
import { mockLocation } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../test'
import type { LocationChange } from './locationChangeObservable'
import { createLocationChangeObservable } from './locationChangeObservable'

describe('locationChangeObservable', () => {
  let observable: Observable<LocationChange>
  let observer: jasmine.Spy<(locationChange: LocationChange) => void>
  let subscription: Subscription
  let fakeLocation: Partial<Location>
  let cleanupLocation: () => void

  beforeEach(() => {
    ;({ location: fakeLocation, cleanup: cleanupLocation } = mockLocation('/foo'))
    observable = createLocationChangeObservable(mockRumConfiguration(), fakeLocation as Location)
    observer = jasmine.createSpy('obs')
    subscription = observable.subscribe(observer)
  })

  afterEach(() => {
    subscription.unsubscribe()
    cleanupLocation()
  })

  it('should notify observers on history change', () => {
    history.pushState({}, '', '/foo?bar=qux')

    const locationChanges = observer.calls.argsFor(0)[0]
    expect(locationChanges.oldLocation.href).toMatch(/\/foo$/)
    expect(locationChanges.newLocation.href).toMatch(/\/foo\?bar=qux$/)
  })

  it('should notify observers on hashchange', (done) => {
    function hashChangeCallback() {
      const locationChanges = observer.calls.argsFor(0)[0]
      expect(locationChanges.oldLocation.href).toMatch(/\/foo$/)
      expect(locationChanges.newLocation.href).toMatch(/\/foo#bar$/)

      window.removeEventListener('hashchange', hashChangeCallback)
      done()
    }
    window.addEventListener('hashchange', hashChangeCallback)

    window.location.hash = '#bar'
  })

  it('should not notify if the url has not changed', () => {
    history.pushState({}, '', '/foo')

    expect(observer).not.toHaveBeenCalled()
  })
})
