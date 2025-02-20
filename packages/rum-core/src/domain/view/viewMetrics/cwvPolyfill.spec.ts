import type { Duration } from '@datadog/browser-core'
import { measureRestoredFCP, measureRestoredLCP, measureRestoredFID } from './cwvPolyfill'

describe('cwvPolyfill', () => {
  let originalRAF: typeof requestAnimationFrame
  let originalPerformanceNow: () => number

  beforeEach(() => {
    originalRAF = window.requestAnimationFrame
    originalPerformanceNow = performance.now

    window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      cb(performance.now())
      return 0
    }
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRAF
    performance.now = originalPerformanceNow
  })

  it('should measure restored FCP correctly', (done) => {
    const fakePageshowEvent = { timeStamp: 100 } as PageTransitionEvent
    performance.now = () => 150
    measureRestoredFCP(fakePageshowEvent, (fcp: Duration) => {
      expect(fcp).toEqual(50 as Duration)
      done()
    })
  })

  it('should measure restored LCP correctly', (done) => {
    const fakePageshowEvent = { timeStamp: 100 } as PageTransitionEvent
    performance.now = () => 150
    measureRestoredLCP(fakePageshowEvent, (lcp: Duration) => {
      expect(lcp).toEqual(50 as Duration)
      done()
    })
  })

  it('should measure restored FID correctly', (done) => {
    const fakePageshowEvent = { timeStamp: 100 } as PageTransitionEvent
    performance.now = () => 150
    measureRestoredFID(fakePageshowEvent, (fid) => {
      expect(fid.delay).toEqual(0 as Duration)
      expect(fid.time).toEqual(50 as Duration)
      done()
    })
  })
})
