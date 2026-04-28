import { trackNavigationTimings } from './trackNavigationTimings'

describe('trackNavigationTimings', () => {
  it('returns undefined before any entry', () => {
    const tracker = trackNavigationTimings()
    expect(tracker.get()).toBeUndefined()
  })

  it('extracts all 5 timing values', () => {
    const tracker = trackNavigationTimings()
    tracker.process({
      responseStart: 100,
      domInteractive: 500,
      domContentLoadedEventEnd: 600,
      domComplete: 800,
      loadEventEnd: 850,
    })
    expect(tracker.get()).toEqual({
      firstByte: 100,
      domInteractive: 500,
      domContentLoaded: 600,
      domComplete: 800,
      loadEvent: 850,
    })
  })

  it('only keeps first entry', () => {
    const tracker = trackNavigationTimings()
    tracker.process({
      responseStart: 100,
      domInteractive: 500,
      domContentLoadedEventEnd: 600,
      domComplete: 800,
      loadEventEnd: 850,
    })
    tracker.process({
      responseStart: 200,
      domInteractive: 900,
      domContentLoadedEventEnd: 1000,
      domComplete: 1200,
      loadEventEnd: 1300,
    })
    expect(tracker.get()!.firstByte).toBe(100)
  })
})
