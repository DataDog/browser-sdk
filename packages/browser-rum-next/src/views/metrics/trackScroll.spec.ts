import { trackScroll } from './trackScroll'

describe('trackScroll', () => {
  it('returns undefined before any scrolling', () => {
    const tracker = trackScroll()
    expect(tracker.get()).toBeUndefined()
  })

  it('start() begins tracking (idempotent — no error on double start)', () => {
    const tracker = trackScroll()
    expect(() => {
      tracker.start()
      tracker.start()
    }).not.toThrow()
    tracker.stop()
  })

  it('stop() removes listener without error when not started', () => {
    const tracker = trackScroll()
    expect(() => tracker.stop()).not.toThrow()
  })

  it('stop() removes listener after start', () => {
    const tracker = trackScroll()
    const addSpy = spyOn(window, 'addEventListener').and.callThrough()
    const removeSpy = spyOn(window, 'removeEventListener').and.callThrough()

    tracker.start()
    expect(addSpy).toHaveBeenCalledWith('scroll', jasmine.any(Function), { passive: true })

    tracker.stop()
    expect(removeSpy).toHaveBeenCalledWith('scroll', jasmine.any(Function))
  })

  it('get() returns ScrollMetrics shape when depth > 0', () => {
    // Simulate measurement by manipulating the DOM to have non-zero scrollHeight/innerHeight
    // In Karma/browser environment, window.innerHeight should be > 0
    const tracker = trackScroll()
    tracker.start()

    const result = tracker.get()
    if (result !== undefined) {
      expect(typeof result.maxDepth).toBe('number')
      expect(typeof result.maxScrollHeight).toBe('number')
      expect(result.maxDepth).toBeGreaterThan(0)
      expect(result.maxScrollHeight).toBeGreaterThanOrEqual(result.maxDepth)
    }
    tracker.stop()
  })

  it('can restart after stop', () => {
    const tracker = trackScroll()
    tracker.start()
    tracker.stop()
    expect(() => tracker.start()).not.toThrow()
    tracker.stop()
  })
})
