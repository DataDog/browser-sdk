import { registerCleanupTask, replaceMockable } from '@datadog/browser-core/test'
import { globalObject } from '@datadog/js-core/util'
import { createWindowOpenObservable } from './windowOpenObservable'

describe('windowOpenObservable', () => {
  it('does not instrument open without a window', () => {
    replaceMockable(globalObject.window, undefined)
    const open = spyOn(window, 'open')
    const { observable, stop } = createWindowOpenObservable()
    const observer = jasmine.createSpy()
    const subscription = observable.subscribe(observer)
    window.open()
    expect(open).toHaveBeenCalled()
    expect(observer).not.toHaveBeenCalled()
    subscription.unsubscribe()
    stop()
  })

  it('should notify observer on `window.open` call', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
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
