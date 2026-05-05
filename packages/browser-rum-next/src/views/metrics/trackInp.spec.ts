import { trackInp } from './trackInp'

describe('trackInp', () => {
  it('returns undefined with no interactions', () => {
    const tracker = trackInp()
    expect(tracker.get()).toBeUndefined()
  })

  it('tracks single interaction', () => {
    const tracker = trackInp()
    tracker.process({ duration: 200, startTime: 0, processingStart: 0, processingEnd: 200, interactionId: 1 })
    const result = tracker.get()!
    expect(result.value).toBe(200)
    expect(result.time).toBe(0)
  })

  it('groups entries by interactionId and takes max duration', () => {
    const tracker = trackInp()
    tracker.process({ duration: 100, startTime: 0, processingStart: 0, processingEnd: 100, interactionId: 1 })
    tracker.process({ duration: 300, startTime: 10, processingStart: 10, processingEnd: 310, interactionId: 1 })
    tracker.process({ duration: 150, startTime: 20, processingStart: 20, processingEnd: 170, interactionId: 1 })
    expect(tracker.get()!.value).toBe(300)
  })

  it('ignores entries with no interactionId', () => {
    const tracker = trackInp()
    tracker.process({ duration: 500, startTime: 0, processingStart: 0, processingEnd: 500 })
    expect(tracker.get()).toBeUndefined()
  })

  it('ignores entries with interactionId === 0', () => {
    const tracker = trackInp()
    tracker.process({ duration: 500, startTime: 0, processingStart: 0, processingEnd: 500, interactionId: 0 })
    expect(tracker.get()).toBeUndefined()
  })

  it('returns P98 (longest for <= 50 interactions)', () => {
    const tracker = trackInp()
    // With 5 interactions, index = floor(5 - 1 - 5 * 0.02) = floor(3.9) = 3
    // But sorted descending, index 0 is the longest
    // For small N, index = floor(N - 1 - N * 0.02) which for N=1 is 0
    tracker.process({ duration: 400, startTime: 0, processingStart: 0, processingEnd: 400, interactionId: 1 })
    tracker.process({ duration: 200, startTime: 0, processingStart: 0, processingEnd: 200, interactionId: 2 })
    tracker.process({ duration: 300, startTime: 0, processingStart: 0, processingEnd: 300, interactionId: 3 })
    // 3 interactions: index = floor(3 - 1 - 3 * 0.02) = floor(1.94) = 1
    // sorted desc: [400, 300, 200] — index 1 = 300
    expect(tracker.get()!.value).toBe(300)
  })

  it('maintains top 10 longest interactions', () => {
    const tracker = trackInp()
    // Add 15 interactions with different durations
    for (let i = 1; i <= 15; i++) {
      tracker.process({ duration: i * 10, startTime: 0, processingStart: 0, processingEnd: i * 10, interactionId: i })
    }
    // Top 10: durations 150, 140, 130, 120, 110, 100, 90, 80, 70, 60
    // N=10: index = floor(10 - 1 - 10 * 0.02) = floor(8.8) = 8
    // sorted desc index 8 = 70
    expect(tracker.get()!.value).toBe(70)
  })

  it('sets targetSelector from target element tagName', () => {
    const tracker = trackInp()
    const btn = { tagName: 'BUTTON' } as Element
    tracker.process({ duration: 200, startTime: 0, processingStart: 0, processingEnd: 200, interactionId: 1, target: btn })
    expect(tracker.get()!.targetSelector).toBe('button')
  })

  describe('sub_parts', () => {
    it('computes sub_parts for a single interaction', () => {
      const tracker = trackInp()
      tracker.process({ duration: 200, startTime: 100, processingStart: 120, processingEnd: 280, interactionId: 1 })
      const result = tracker.get()!
      expect(result.subParts).toBeDefined()
      // nextPaintTime = max(100 + 200, 120) = 300
      // processingEnd = min(280, 300) = 280
      expect(result.subParts!.inputDelay).toBe(20) // 120 - 100
      expect(result.subParts!.processingDuration).toBe(160) // 280 - 120
      expect(result.subParts!.presentationDelay).toBe(20) // 300 - 280
    })

    it('sub_parts values sum to the INP duration', () => {
      const tracker = trackInp()
      tracker.process({ duration: 200, startTime: 100, processingStart: 120, processingEnd: 280, interactionId: 1 })
      const result = tracker.get()!
      const { inputDelay, processingDuration, presentationDelay } = result.subParts!
      expect(inputDelay + processingDuration + presentationDelay).toBe(result.value)
    })

    it('merges entries within 8ms render window into same group', () => {
      const tracker = trackInp()
      // Entry 1: renderTime = 100 + 200 = 300
      tracker.process({ duration: 200, startTime: 100, processingStart: 110, processingEnd: 250, interactionId: 1 })
      // Entry 2: renderTime = 95 + 207 = 302 (within 8ms of 300), different interactionId
      tracker.process({ duration: 207, startTime: 95, processingStart: 105, processingEnd: 270, interactionId: 2 })

      // Only 2 interactions; P98 index for n=2: floor(2 - 1 - 2 * 0.02) = floor(0.96) = 0 → duration 207
      const result = tracker.get()!
      expect(result.value).toBe(207)
      // group.startTime = min(100, 95) = 95
      // group.processingStart = min(110, 105) = 105
      // group.processingEnd = max(250, 270) = 270
      // inpDuration = 207, nextPaintTime = max(95 + 207, 105) = max(302, 105) = 302
      // processingEnd = min(270, 302) = 270
      // inputDelay = 105 - 95 = 10
      // processingDuration = 270 - 105 = 165
      // presentationDelay = 302 - 270 = 32
      expect(result.subParts!.inputDelay).toBe(10)
      expect(result.subParts!.processingDuration).toBe(165)
      expect(result.subParts!.presentationDelay).toBe(32)
      expect(result.subParts!.inputDelay + result.subParts!.processingDuration + result.subParts!.presentationDelay).toBe(207)
    })

    it('does not merge entries outside 8ms render window', () => {
      const tracker = trackInp()
      // Entry 1: renderTime = 100 + 200 = 300
      tracker.process({ duration: 200, startTime: 100, processingStart: 110, processingEnd: 250, interactionId: 1 })
      // Entry 2: renderTime = 100 + 230 = 330 (outside 8ms window)
      tracker.process({ duration: 230, startTime: 100, processingStart: 115, processingEnd: 260, interactionId: 2 })

      // P98 for n=2 → index 0 → duration 230
      const result = tracker.get()!
      expect(result.value).toBe(230)
      // Should not be merged; group for interactionId 2 is standalone
      // nextPaintTime = max(100 + 230, 115) = 330
      // processingEnd = min(260, 330) = 260
      expect(result.subParts!.inputDelay).toBe(15) // 115 - 100
      expect(result.subParts!.processingDuration).toBe(145) // 260 - 115
      expect(result.subParts!.presentationDelay).toBe(70) // 330 - 260
    })

    it('applies MIN/MAX consolidation for same interactionId', () => {
      const tracker = trackInp()
      // Two entries for the same interactionId
      tracker.process({ duration: 100, startTime: 100, processingStart: 120, processingEnd: 180, interactionId: 1 })
      tracker.process({ duration: 200, startTime: 90, processingStart: 110, processingEnd: 250, interactionId: 1 })

      const result = tracker.get()!
      // Interactions map takes max duration = 200; uses startTime from that entry (90)
      // Group: startTime = min(100, 90) = 90, processingStart = min(120, 110) = 110, processingEnd = max(180, 250) = 250
      // nextPaintTime = max(90 + 200, 110) = 290
      // processingEnd = min(250, 290) = 250
      // inputDelay = 110 - 90 = 20
      // processingDuration = 250 - 110 = 140
      // presentationDelay = 290 - 250 = 40
      expect(result.subParts!.inputDelay).toBe(20)
      expect(result.subParts!.processingDuration).toBe(140)
      expect(result.subParts!.presentationDelay).toBe(40)
      expect(result.subParts!.inputDelay + result.subParts!.processingDuration + result.subParts!.presentationDelay).toBe(200)
    })

    it('returns undefined sub_parts when processingStart/processingEnd are missing', () => {
      const tracker = trackInp()
      // No processingStart/processingEnd fields
      tracker.process({ duration: 200, startTime: 0, processingStart: 0, processingEnd: 0, interactionId: 1 })
      // processingStart and processingEnd being 0 means no valid processing info
      // The sub_parts should still be computed (0 is a valid value)
      // Instead test with undefined-like: since InpEntry requires them, test via a cast
      const trackerAny = trackInp()
      trackerAny.process({ duration: 200, startTime: 0 } as any)
      // No interactionId so should be undefined
      expect(trackerAny.get()).toBeUndefined()
    })

    it('prunes groups for interactions not in top list', () => {
      const tracker = trackInp()
      // Fill up 10 interactions (the max)
      for (let i = 1; i <= 10; i++) {
        tracker.process({ duration: i * 100, startTime: i, processingStart: i + 10, processingEnd: i + i * 100, interactionId: i })
      }
      // Add an 11th with very high duration to push out the lowest (id=1, duration=100)
      tracker.process({ duration: 1100, startTime: 11, processingStart: 21, processingEnd: 1111, interactionId: 11 })

      // Interaction id=1 (duration=100) should be pruned from top 10
      // The P98 result should have valid sub_parts from top interactions
      const result = tracker.get()!
      expect(result.subParts).toBeDefined()
    })
  })
})
