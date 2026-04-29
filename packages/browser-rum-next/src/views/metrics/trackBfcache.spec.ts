import { trackBfcache } from './trackBfcache'

describe('trackBfcache', () => {
  it('returns undefined immediately after creation (before RAFs run)', () => {
    const tracker = trackBfcache(performance.now())
    expect(tracker.get()).toBeUndefined()
  })

  it('get() returns BfcacheMetrics shape after two animation frames', (done) => {
    const startTime = performance.now()
    const tracker = trackBfcache(startTime)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // One more RAF to ensure our inner RAF has run
        requestAnimationFrame(() => {
          const result = tracker.get()
          expect(result).toBeDefined()
          expect(typeof result!.firstContentfulPaint).toBe('number')
          expect(result!.firstContentfulPaint).toBeGreaterThanOrEqual(0)
          expect(result!.largestContentfulPaint).toBeDefined()
          expect(result!.largestContentfulPaint.value).toBe(result!.firstContentfulPaint)
          done()
        })
      })
    })
  })

  it('FCP and LCP values are equal (both from same paint time)', (done) => {
    const startTime = performance.now()
    const tracker = trackBfcache(startTime)

    // Wait for both RAFs to complete
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const result = tracker.get()
          if (result) {
            expect(result.firstContentfulPaint).toBe(result.largestContentfulPaint.value)
          }
          done()
        })
      })
    })
  })
})
