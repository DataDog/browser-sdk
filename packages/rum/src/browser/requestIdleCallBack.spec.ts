import { requestIdleCallback } from './requestIdleCallback'

describe('requestIdleCallback', () => {
  let callback: jasmine.Spy
  const originalRequestIdleCallback = window.requestIdleCallback

  beforeEach(() => {
    callback = jasmine.createSpy('callback')
  })

  afterEach(() => {
    if (originalRequestIdleCallback) {
      window.requestIdleCallback = originalRequestIdleCallback
    }
  })

  it('should use requestIdleCallback when supported', () => {
    if (!window.requestIdleCallback) {
      pending('requestIdleCallback not supported')
    }
    spyOn(window, 'requestIdleCallback').and.callFake((cb) => {
      cb({} as IdleDeadline)
      return 123
    })
    spyOn(window, 'cancelIdleCallback')

    const cancel = requestIdleCallback(callback)
    expect(window.requestIdleCallback).toHaveBeenCalled()
    cancel()
    expect(window.cancelIdleCallback).toHaveBeenCalledWith(123)
  })

  it('should use requestAnimationFrame when requestIdleCallback is not supported', () => {
    if (window.requestIdleCallback) {
      window.requestIdleCallback = undefined as any
    }
    spyOn(window, 'requestAnimationFrame').and.callFake((cb) => {
      cb(1)
      return 123
    })
    spyOn(window, 'cancelAnimationFrame')

    const cancel = requestIdleCallback(callback)
    expect(window.requestAnimationFrame).toHaveBeenCalled()
    cancel()
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(123)
  })
})
