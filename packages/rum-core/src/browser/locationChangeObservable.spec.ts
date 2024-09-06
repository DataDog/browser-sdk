import { registerCleanupTask } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { createLocationChangeObservable } from './locationChangeObservable'

describe('locationChangeObservable', () => {
  it('should notify observers on history change', () => {
    const observer = setup()

    history.pushState({}, '', '/foo?bar=qux')

    const locationChanges = observer.calls.argsFor(0)[0]
    expect(locationChanges.oldLocation.href).toMatch(/\/foo$/)
    expect(locationChanges.newLocation.href).toMatch(/\/foo\?bar=qux$/)
  })

  it('should notify observers on hashchange', (done) => {
    const observer = setup()

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
    const observer = setup()

    history.pushState({}, '', '/foo')

    expect(observer).not.toHaveBeenCalled()
  })

  it('allow frameworks to patch history.pushState', () => {
    const wrapperSpy = setupHistoryInstancePushStateWrapper()
    const observer = setup()

    history.pushState({}, '', '/foo?bar=qux')

    const locationChanges = observer.calls.argsFor(0)[0]
    expect(locationChanges.oldLocation.href).toMatch(/\/foo$/)
    expect(locationChanges.newLocation.href).toMatch(/\/foo\?bar=qux$/)
    expect(wrapperSpy).toHaveBeenCalled()
  })

  it('allow frameworks to patch History.prototype.pushState', () => {
    const wrapperSpy = setupHistoryPrototypePushStateWrapper()
    const observer = setup()

    history.pushState({}, '', '/foo?bar=qux')

    const locationChanges = observer.calls.argsFor(0)[0]
    expect(locationChanges.oldLocation.href).toMatch(/\/foo$/)
    expect(locationChanges.newLocation.href).toMatch(/\/foo\?bar=qux$/)
    expect(wrapperSpy).toHaveBeenCalled()
  })
})

function setup() {
  const originalPathname = location.pathname

  history.pushState({}, '', '/foo')

  const observable = createLocationChangeObservable({} as RumConfiguration, location)
  const observer = jasmine.createSpy('obs')
  const subscription = observable.subscribe(observer)

  registerCleanupTask(() => {
    subscription.unsubscribe()
    history.pushState({}, '', originalPathname)
  })

  return observer
}

function setupHistoryInstancePushStateWrapper() {
  const wrapperSpy = jasmine.createSpy('wrapperSpy')
  const originalPushState = history.pushState.bind(history)

  history.pushState = (...args) => {
    wrapperSpy(...args)
    originalPushState(...args)
  }

  registerCleanupTask(() => {
    // @ts-expect-error reseting history instance to its original state
    delete history.pushState
  })

  return wrapperSpy
}

function setupHistoryPrototypePushStateWrapper() {
  const wrapperSpy = jasmine.createSpy('wrapperSpy')
  const originalPushState = History.prototype.pushState.bind(history)

  History.prototype.pushState = (...args) => {
    wrapperSpy(...args)
    originalPushState(...args)
  }

  registerCleanupTask(() => {
    History.prototype.pushState = originalPushState
  })

  return wrapperSpy
}
