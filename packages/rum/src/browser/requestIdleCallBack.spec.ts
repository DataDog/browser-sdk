import { requestIdleCallback } from './requestIdleCallback'

describe('requestIdleCallback', () => {
  let requestAnimationFrameSpy: jasmine.Spy
  let cancelAnimationFrameSpy: jasmine.Spy
  let callback: jasmine.Spy
  const originalRequestIdleCallback = window.requestIdleCallback
  const originalCancelIdleCallback = window.cancelIdleCallback

  beforeEach(() => {
    requestAnimationFrameSpy = spyOn(window, 'requestAnimationFrame').and.callFake((cb) => {
      cb(0)
      return 123
    })
    cancelAnimationFrameSpy = spyOn(window, 'cancelAnimationFrame')
    callback = jasmine.createSpy('callback')
  })

  afterEach(() => {
    window.requestIdleCallback = originalRequestIdleCallback
    window.cancelIdleCallback = originalCancelIdleCallback
  })

  it('should use requestAnimationFrame when requestIdleCallback is not defined', () => {
    window.requestIdleCallback = undefined as any
    window.cancelIdleCallback = undefined as any

    const cancel = requestIdleCallback(callback)
    expect(requestAnimationFrameSpy).toHaveBeenCalled()
    cancel()
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(123)
  })
})
