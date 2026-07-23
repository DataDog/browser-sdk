import { throttle } from './functionUtils'

describe('throttle', () => {
  let spy: jasmine.Spy
  let throttled: () => void
  let cancel: () => void

  beforeEach(() => {
    jasmine.clock().install()
    spy = jasmine.createSpy()
  })

  afterEach(() => {
    jasmine.clock().uninstall()
  })

  describe('when {leading: false, trailing:false}', () => {
    beforeEach(() => {
      throttled = throttle(spy, 2, { leading: false, trailing: false }).throttled
    })

    it('should not call throttled function', () => {
      throttled()
      expect(spy).toHaveBeenCalledTimes(0)
      jasmine.clock().tick(2)
      expect(spy).toHaveBeenCalledTimes(0)
    })
  })

  describe('when {leading: false, trailing:true}', () => {
    beforeEach(() => {
      throttled = throttle(spy, 2, { leading: false }).throttled
    })

    it('should call throttled function after the wait period', () => {
      throttled()
      expect(spy).toHaveBeenCalledTimes(0)
      jasmine.clock().tick(2)
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('should dismiss calls made during the wait period', () => {
      throttled()
      jasmine.clock().tick(1)
      throttled()
      jasmine.clock().tick(1)
      expect(spy).toHaveBeenCalledTimes(1)
    })
  })

  describe('when {leading: true, trailing:false}', () => {
    beforeEach(() => {
      throttled = throttle(spy, 2, { trailing: false }).throttled
    })

    it('should call throttled function immediately', () => {
      throttled()
      expect(spy).toHaveBeenCalledTimes(1)
      jasmine.clock().tick(2)
      expect(spy).toHaveBeenCalledTimes(1)
    })
  })

  describe('when {leading: true, trailing:true} (default)', () => {
    beforeEach(() => {
      throttled = throttle(spy, 2).throttled
    })

    it('should call throttled function immediately, then once more for calls made during the wait period', () => {
      throttled()
      expect(spy).toHaveBeenCalledTimes(1)

      throttled()
      expect(spy).toHaveBeenCalledTimes(1)

      jasmine.clock().tick(2)
      expect(spy).toHaveBeenCalledTimes(2)
    })

    it('passes last parameters as arguments', () => {
      throttled = throttle(spy, 2).throttled
      ;(throttled as (n: number) => void)(1)
      ;(throttled as (n: number) => void)(2)
      ;(throttled as (n: number) => void)(3)
      jasmine.clock().tick(2)
      expect(spy.calls.allArgs()).toEqual([[1], [3]])
    })
  })

  describe('cancel', () => {
    beforeEach(() => {
      const result = throttle(spy, 2)
      cancel = result.cancel
      throttled = result.throttled
    })

    it('should abort pending execution', () => {
      throttled()
      throttled()
      expect(spy).toHaveBeenCalledTimes(1)

      cancel()

      jasmine.clock().tick(2)
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('should allow future calls', () => {
      cancel()
      throttled()
      expect(spy).toHaveBeenCalledTimes(1)
      jasmine.clock().tick(2)
      expect(spy).toHaveBeenCalledTimes(1)
    })
  })
})
