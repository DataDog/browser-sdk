import { setTimeout, clearTimeout, setInterval, clearInterval } from './timer'
;[
  {
    name: 'setTimeout' as const,
    setTimer: setTimeout,
    clearTimer: clearTimeout,
  },
  {
    name: 'setInterval' as const,
    setTimer: setInterval,
    clearTimer: clearInterval,
  },
].forEach(({ name, setTimer, clearTimer }) => {
  describe(name, () => {
    beforeEach(() => {
      jasmine.clock().install()
    })

    afterEach(() => {
      jasmine.clock().uninstall()
    })

    it('executes the callback asynchronously', () => {
      const spy = jasmine.createSpy()
      setTimer(spy)
      expect(spy).not.toHaveBeenCalled()
      jasmine.clock().tick(0)
      expect(spy).toHaveBeenCalledOnceWith()
    })

    it('can be canceled', () => {
      const spy = jasmine.createSpy()
      const timerId = setTimer(spy)
      clearTimer(timerId)
      jasmine.clock().tick(0)
      expect(spy).not.toHaveBeenCalled()
    })
  })
})
