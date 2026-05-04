import { vi, describe, expect, it } from 'vitest'
import { registerCleanupTask } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { createLocationChangeObservable } from './locationChangeObservable'

describe('locationChangeObservable', () => {
  it('should notify observers on history change', () => {
    const observer = setup()

    history.pushState({}, '', '/foo?bar=qux')

    const locationChanges = observer.mock.calls[0][0]
    expect(locationChanges.oldLocation.href).toMatch(/\/foo$/)
    expect(locationChanges.newLocation.href).toMatch(/\/foo\?bar=qux$/)
  })

  it('should notify observers on hashchange', () =>
    new Promise<void>((resolve) => {
      const observer = setup()

      function hashChangeCallback() {
        const locationChanges = observer.mock.calls[0][0]
        expect(locationChanges.oldLocation.href).toMatch(/\/foo$/)
        expect(locationChanges.newLocation.href).toMatch(/\/foo#bar$/)

        window.removeEventListener('hashchange', hashChangeCallback)
        resolve()
      }
      window.addEventListener('hashchange', hashChangeCallback)

      window.location.hash = '#bar'
    }))

  it('should not notify if the url has not changed', () => {
    const observer = setup()

    history.pushState({}, '', '/foo')

    expect(observer).not.toHaveBeenCalled()
  })

  it('allow frameworks to patch history.pushState', () => {
    const wrapperSpy = setupHistoryInstancePushStateWrapper()
    const observer = setup()

    history.pushState({}, '', '/foo?bar=qux')

    const locationChanges = observer.mock.calls[0][0]
    expect(locationChanges.oldLocation.href).toMatch(/\/foo$/)
    expect(locationChanges.newLocation.href).toMatch(/\/foo\?bar=qux$/)
    expect(wrapperSpy).toHaveBeenCalled()
  })

  it('allow frameworks to patch History.prototype.pushState', () => {
    const wrapperSpy = setupHistoryPrototypePushStateWrapper()
    const observer = setup()

    history.pushState({}, '', '/foo?bar=qux')

    const locationChanges = observer.mock.calls[0][0]
    expect(locationChanges.oldLocation.href).toMatch(/\/foo$/)
    expect(locationChanges.newLocation.href).toMatch(/\/foo\?bar=qux$/)
    expect(wrapperSpy).toHaveBeenCalled()
  })
})

function setup() {
  const originalPathname = location.pathname

  history.pushState({}, '', '/foo')

  const observable = createLocationChangeObservable({} as RumConfiguration)
  const observer = vi.fn()
  const subscription = observable.subscribe(observer)

  registerCleanupTask(() => {
    subscription.unsubscribe()
    history.pushState({}, '', originalPathname)
  })

  return observer
}

function setupHistoryInstancePushStateWrapper() {
  const wrapperSpy = vi.fn()
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
  const wrapperSpy = vi.fn()
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
