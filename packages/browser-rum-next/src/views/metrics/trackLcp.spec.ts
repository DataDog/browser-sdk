import { trackLcp } from './trackLcp'

describe('trackLcp', () => {
  it('returns undefined with no entries', () => {
    const tracker = trackLcp()
    expect(tracker.get()).toBeUndefined()
  })

  it('returns latest entry value', () => {
    spyOn(performance, 'getEntriesByType').and.returnValue([])
    const tracker = trackLcp()
    tracker.process({ startTime: 1500, size: 200 })
    expect(tracker.get()!.value).toBe(1500)
  })

  it('replaces previous value with newer entry', () => {
    spyOn(performance, 'getEntriesByType').and.returnValue([])
    const tracker = trackLcp()
    tracker.process({ startTime: 1000, size: 100 })
    tracker.process({ startTime: 2500, size: 400 })
    expect(tracker.get()!.value).toBe(2500)
  })

  it('ignores entries after stop()', () => {
    spyOn(performance, 'getEntriesByType').and.returnValue([])
    const tracker = trackLcp()
    tracker.process({ startTime: 1000, size: 100 })
    tracker.stop()
    tracker.process({ startTime: 3000, size: 800 })
    expect(tracker.get()!.value).toBe(1000)
  })

  it('sets targetSelector from element tagName', () => {
    spyOn(performance, 'getEntriesByType').and.returnValue([])
    const tracker = trackLcp()
    const img = { tagName: 'IMG' } as Element
    tracker.process({ startTime: 2000, size: 500, element: img })
    expect(tracker.get()!.targetSelector).toBe('img')
  })

  it('has no targetSelector when element is absent', () => {
    spyOn(performance, 'getEntriesByType').and.returnValue([])
    const tracker = trackLcp()
    tracker.process({ startTime: 1000, size: 200 })
    expect(tracker.get()!.targetSelector).toBeUndefined()
  })

  describe('resourceUrl', () => {
    it('captures resourceUrl from entry url', () => {
      spyOn(performance, 'getEntriesByType').and.returnValue([])
      const tracker = trackLcp()
      tracker.process({ startTime: 500, size: 1000, url: 'https://example.com/img.png' })
      expect(tracker.get()!.resourceUrl).toBe('https://example.com/img.png')
    })

    it('sets resourceUrl to undefined when entry url is empty string', () => {
      spyOn(performance, 'getEntriesByType').and.returnValue([])
      const tracker = trackLcp()
      tracker.process({ startTime: 500, size: 1000, url: '' })
      expect(tracker.get()!.resourceUrl).toBeUndefined()
    })

    it('sets resourceUrl to undefined when entry url is absent', () => {
      spyOn(performance, 'getEntriesByType').and.returnValue([])
      const tracker = trackLcp()
      tracker.process({ startTime: 500, size: 1000 })
      expect(tracker.get()!.resourceUrl).toBeUndefined()
    })
  })

  describe('subParts', () => {
    it('computes subParts with resource entry', () => {
      spyOn(performance, 'getEntriesByType').and.callFake((type: string) => {
        if (type === 'navigation') return [{ responseStart: 100 }] as any
        if (type === 'resource')
          return [
            { name: 'https://example.com/img.png', startTime: 50, requestStart: 150, responseEnd: 400 },
          ] as any
        return []
      })
      const tracker = trackLcp()
      tracker.process({ startTime: 500, size: 1000, url: 'https://example.com/img.png' })
      const result = tracker.get()!
      expect(result.subParts).toBeDefined()
      // lcpRequestStart = max(100, 150) = 150
      // lcpResponseEnd = min(500, max(150, 400)) = 400
      expect(result.subParts!.loadDelay).toBe(50) // 150 - 100
      expect(result.subParts!.loadTime).toBe(250) // 400 - 150
      expect(result.subParts!.renderDelay).toBe(100) // 500 - 400
    })

    it('subParts sum equals lcpValue minus firstByte', () => {
      spyOn(performance, 'getEntriesByType').and.callFake((type: string) => {
        if (type === 'navigation') return [{ responseStart: 100 }] as any
        if (type === 'resource')
          return [
            { name: 'https://example.com/img.png', startTime: 50, requestStart: 150, responseEnd: 400 },
          ] as any
        return []
      })
      const tracker = trackLcp()
      tracker.process({ startTime: 500, size: 1000, url: 'https://example.com/img.png' })
      const result = tracker.get()!
      const { loadDelay, loadTime, renderDelay } = result.subParts!
      expect(loadDelay + loadTime + renderDelay).toBe(500 - 100)
    })

    it('computes subParts for text LCP (no resource)', () => {
      spyOn(performance, 'getEntriesByType').and.callFake((type: string) => {
        if (type === 'navigation') return [{ responseStart: 100 }] as any
        return []
      })
      const tracker = trackLcp()
      tracker.process({ startTime: 500, size: 1000 })
      const result = tracker.get()!
      expect(result.subParts).toBeDefined()
      // No resource: lcpRequestStart = firstByte = 100, lcpResponseEnd = min(500, max(100, 0)) = 100
      expect(result.subParts!.loadDelay).toBe(0)
      expect(result.subParts!.loadTime).toBe(0)
      expect(result.subParts!.renderDelay).toBe(400) // 500 - 100
    })

    it('returns subParts undefined when navigation timing is unavailable', () => {
      spyOn(performance, 'getEntriesByType').and.callFake((type: string) => {
        if (type === 'navigation') return [] as any
        return []
      })
      const tracker = trackLcp()
      tracker.process({ startTime: 500, size: 1000, url: 'https://example.com/img.png' })
      expect(tracker.get()!.subParts).toBeUndefined()
    })

    it('returns subParts undefined when navigation responseStart is zero', () => {
      spyOn(performance, 'getEntriesByType').and.callFake((type: string) => {
        if (type === 'navigation') return [{ responseStart: 0 }] as any
        return []
      })
      const tracker = trackLcp()
      tracker.process({ startTime: 500, size: 1000, url: 'https://example.com/img.png' })
      expect(tracker.get()!.subParts).toBeUndefined()
    })

    it('picks the most recent resource entry before LCP time', () => {
      spyOn(performance, 'getEntriesByType').and.callFake((type: string) => {
        if (type === 'navigation') return [{ responseStart: 100 }] as any
        if (type === 'resource')
          return [
            { name: 'https://example.com/img.png', startTime: 50, requestStart: 120, responseEnd: 300 },
            { name: 'https://example.com/img.png', startTime: 200, requestStart: 210, responseEnd: 380 },
            // This one starts after LCP, should be ignored
            { name: 'https://example.com/img.png', startTime: 600, requestStart: 610, responseEnd: 700 },
          ] as any
        return []
      })
      const tracker = trackLcp()
      tracker.process({ startTime: 500, size: 1000, url: 'https://example.com/img.png' })
      const result = tracker.get()!
      // Should pick startTime: 200 entry (most recent before LCP 500)
      // lcpRequestStart = max(100, 210) = 210
      // lcpResponseEnd = min(500, max(210, 380)) = 380
      expect(result.subParts!.loadDelay).toBe(110) // 210 - 100
      expect(result.subParts!.loadTime).toBe(170) // 380 - 210
      expect(result.subParts!.renderDelay).toBe(120) // 500 - 380
    })

    it('uses entry startTime as fallback when requestStart is zero', () => {
      spyOn(performance, 'getEntriesByType').and.callFake((type: string) => {
        if (type === 'navigation') return [{ responseStart: 100 }] as any
        if (type === 'resource')
          return [
            { name: 'https://example.com/img.png', startTime: 150, requestStart: 0, responseEnd: 400 },
          ] as any
        return []
      })
      const tracker = trackLcp()
      tracker.process({ startTime: 500, size: 1000, url: 'https://example.com/img.png' })
      const result = tracker.get()!
      // requestStart is 0, falls back to startTime 150
      // lcpRequestStart = max(100, 150) = 150
      expect(result.subParts!.loadDelay).toBe(50)
    })
  })
})
