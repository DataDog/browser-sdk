import { registerCleanupTask } from '@datadog/browser-core/test'
import { createWindowOpenObservable } from './windowOpenObservable'

describe('windowOpenObservable', () => {
  it('should notify observer on `window.open` call', () => {
    const original = window.open
    window.open = jasmine.createSpy()
    const spy = jasmine.createSpy()

    const { observable, stop } = createWindowOpenObservable()
    const { unsubscribe } = observable.subscribe(spy)

    registerCleanupTask(() => {
      unsubscribe()
      stop()
      window.open = original
    })

    window.open()

    expect(spy).toHaveBeenCalledTimes(1)
  })
})
