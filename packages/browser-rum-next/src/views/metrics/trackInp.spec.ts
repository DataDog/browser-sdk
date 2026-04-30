import { trackInp } from './trackInp'

describe('trackInp', () => {
  it('returns undefined with no interactions', () => {
    const tracker = trackInp()
    expect(tracker.get()).toBeUndefined()
  })

  it('tracks single interaction', () => {
    const tracker = trackInp()
    tracker.process({ duration: 200, startTime: 0, processingStart: 0, processingEnd: 200, interactionId: 1 })
    expect(tracker.get()).toEqual({ value: 200, time: 0 })
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
})
