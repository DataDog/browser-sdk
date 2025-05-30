import type { Clock } from '../../../test'
import { mockClock } from '../../../test'
import { throttle } from './functionUtils'

describe('functionUtils', () => {
  describe('throttle', () => {
    let spy: jasmine.Spy
    let throttled: () => void
    let cancel: () => void
    let clock: Clock

    beforeEach(() => {
      clock = mockClock()
      spy = jasmine.createSpy()
    })

    describe('when {leading: false, trailing:false}', () => {
      beforeEach(() => {
        throttled = throttle(spy, 2, { leading: false, trailing: false }).throttled
      })

      it('should not call throttled function', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(0)
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(0)
      })

      it('should not called throttled function after the wait period', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(0)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(0)

        throttled()
        expect(spy).toHaveBeenCalledTimes(0)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(0)

        throttled()
        expect(spy).toHaveBeenCalledTimes(0)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(0)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(0)
      })

      it('should not called throttled function performed after the wait period', () => {
        throttled()
        clock.tick(2)
        throttled()
        clock.tick(2)
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
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should dismiss calls made during the wait period', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(0)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(0)

        throttled()
        expect(spy).toHaveBeenCalledTimes(0)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(1)

        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(1)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(2)
      })

      it('should perform calls made after the wait period', () => {
        throttled()
        clock.tick(2)
        throttled()
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(2)
      })
    })

    describe('when {leading: true, trailing:false}', () => {
      beforeEach(() => {
        throttled = throttle(spy, 2, { trailing: false }).throttled
      })

      it('should call throttled function immediately', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(1)
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should dismiss calls made during the wait period', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(1)

        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(1)

        throttled()
        expect(spy).toHaveBeenCalledTimes(2)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(2)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(2)
      })

      it('should perform calls made after the wait period', () => {
        throttled()
        clock.tick(2)
        throttled()
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(2)
      })
    })

    describe('when {leading: true, trailing:true}', () => {
      beforeEach(() => {
        throttled = throttle(spy, 2).throttled
      })

      it('should call throttled function immediately', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(1)
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should postpone calls made during the wait period to after the period', () => {
        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(1)

        throttled()
        expect(spy).toHaveBeenCalledTimes(1)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(2)

        throttled()
        expect(spy).toHaveBeenCalledTimes(3)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(3)

        clock.tick(1)
        expect(spy).toHaveBeenCalledTimes(3)
      })

      it('should perform calls made after the wait period', () => {
        throttled()
        clock.tick(2)
        throttled()
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(2)
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

        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('should allow future calls', () => {
        cancel()
        throttled()
        expect(spy).toHaveBeenCalledTimes(1)
        clock.tick(2)
        expect(spy).toHaveBeenCalledTimes(1)
      })
    })

    it('passes last parameters as arguments', () => {
      const throttled = throttle(spy, 2).throttled
      throttled(1)
      throttled(2)
      throttled(3)
      clock.tick(2)
      expect(spy.calls.allArgs()).toEqual([[1], [3]])
    })
  })
})
