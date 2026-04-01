import { throttle } from '.'

describe('throttle', () => {
  beforeEach(() => {
    jasmine.clock().install()
  })

  afterEach(() => {
    jasmine.clock().uninstall()
  })

  it('should execute immediately on first call when leading is true', () => {
    const fn = jasmine.createSpy('fn')
    const { throttled } = throttle(fn, 100, { leading: true, trailing: false })

    throttled()

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should not execute immediately on first call when leading is false', () => {
    const fn = jasmine.createSpy('fn')
    const { throttled } = throttle(fn, 100, { leading: false, trailing: true })

    throttled()

    expect(fn).not.toHaveBeenCalled()
  })

  it('should execute after wait when trailing is true', () => {
    const fn = jasmine.createSpy('fn')
    const { throttled } = throttle(fn, 100, { leading: false, trailing: true })

    throttled()
    jasmine.clock().tick(100)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should ignore subsequent calls during wait period', () => {
    const fn = jasmine.createSpy('fn')
    const { throttled } = throttle(fn, 100, { leading: false, trailing: true })

    throttled()
    throttled()
    throttled()
    jasmine.clock().tick(100)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should allow calling again after wait period', () => {
    const fn = jasmine.createSpy('fn')
    const { throttled } = throttle(fn, 100, { leading: false, trailing: true })

    throttled()
    jasmine.clock().tick(100)
    throttled()
    jasmine.clock().tick(100)

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should not execute after cancel', () => {
    const fn = jasmine.createSpy('fn')
    const { throttled, cancel } = throttle(fn, 100, { leading: false, trailing: true })

    throttled()
    cancel()
    jasmine.clock().tick(100)

    expect(fn).not.toHaveBeenCalled()
  })
})
