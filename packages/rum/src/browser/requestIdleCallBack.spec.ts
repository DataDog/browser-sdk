import { requestIdleCallback } from './requestIdleCallback'

describe('requestIdleCallback', () => {
  let requestAnimationFrameSpy: jasmine.Spy
  let cancelAnimationFrameSpy: jasmine.Spy
  let callback: jasmine.Spy

  beforeEach(() => {
    requestAnimationFrameSpy = spyOn(window, 'requestAnimationFrame').and.callFake((cb) => {
      cb(0)
      return 123
    })
    cancelAnimationFrameSpy = spyOn(window, 'cancelAnimationFrame')
    callback = jasmine.createSpy('callback')
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
