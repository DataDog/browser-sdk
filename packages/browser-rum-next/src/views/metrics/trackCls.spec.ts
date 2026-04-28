import { trackCls } from './trackCls'

describe('trackCls', () => {
  it('returns undefined with no shifts', () => {
    const tracker = trackCls()
    expect(tracker.get()).toBeUndefined()
  })

  it('computes value from single shift', () => {
    const tracker = trackCls()
    tracker.process({ value: 0.1, hadRecentInput: false, startTime: 100 })
    expect(tracker.get()).toEqual({ value: 0.1 })
  })

  it('accumulates shifts within same session window', () => {
    const tracker = trackCls()
    tracker.process({ value: 0.1, hadRecentInput: false, startTime: 0 })
    tracker.process({ value: 0.2, hadRecentInput: false, startTime: 500 })
    expect(tracker.get()!.value).toBeCloseTo(0.3)
  })

  it('starts new window after 1s gap', () => {
    const tracker = trackCls()
    tracker.process({ value: 0.1, hadRecentInput: false, startTime: 0 })
    tracker.process({ value: 0.05, hadRecentInput: false, startTime: 1100 })
    // First window: 0.1, second window: 0.05 — max is 0.1
    expect(tracker.get()!.value).toBeCloseTo(0.1)
  })

  it('starts new window after 5s max duration', () => {
    const tracker = trackCls()
    // Add entries within the same window (gaps < 1s)
    tracker.process({ value: 0.1, hadRecentInput: false, startTime: 0 })
    tracker.process({ value: 0.1, hadRecentInput: false, startTime: 100 })
    // Entry at 5000ms — same window start was 0, 5000 - 0 >= 5000 → new window
    tracker.process({ value: 0.5, hadRecentInput: false, startTime: 5000 })
    // First window: 0.2, second window: 0.5 — max is 0.5
    expect(tracker.get()!.value).toBeCloseTo(0.5)
  })

  it('reports maximum window value (not latest)', () => {
    const tracker = trackCls()
    // First window: large
    tracker.process({ value: 0.5, hadRecentInput: false, startTime: 0 })
    tracker.process({ value: 0.3, hadRecentInput: false, startTime: 200 })
    // Start new window (>1s gap)
    tracker.process({ value: 0.1, hadRecentInput: false, startTime: 2000 })
    // Max window is first: 0.8
    expect(tracker.get()!.value).toBeCloseTo(0.8)
  })

  it('ignores entries with hadRecentInput === true', () => {
    const tracker = trackCls()
    tracker.process({ value: 0.5, hadRecentInput: true, startTime: 100 })
    expect(tracker.get()).toBeUndefined()
  })

  it('tracks targetSelector from largest shift node', () => {
    const tracker = trackCls()
    const div = { tagName: 'DIV' } as Element
    tracker.process({ value: 0.1, hadRecentInput: false, startTime: 0, sources: [{ node: div }] })
    expect(tracker.get()!.targetSelector).toBe('div')
  })

  it('updates targetSelector to largest shift in window', () => {
    const tracker = trackCls()
    const img = { tagName: 'IMG' } as Element
    const p = { tagName: 'P' } as Element
    tracker.process({ value: 0.1, hadRecentInput: false, startTime: 0, sources: [{ node: p }] })
    tracker.process({ value: 0.3, hadRecentInput: false, startTime: 200, sources: [{ node: img }] })
    // img had the larger individual shift (0.3 > 0.1)
    expect(tracker.get()!.targetSelector).toBe('img')
  })
})
