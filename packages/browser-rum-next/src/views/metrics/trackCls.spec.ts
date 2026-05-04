import { trackCls } from './trackCls'

function rect(x: number, y: number, w: number, h: number): DOMRectReadOnly {
  return { x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRectReadOnly
}

describe('trackCls', () => {
  it('returns undefined with no shifts', () => {
    const tracker = trackCls()
    expect(tracker.get()).toBeUndefined()
  })

  it('computes value from single shift', () => {
    const tracker = trackCls()
    tracker.process({ value: 0.1, hadRecentInput: false, startTime: 100 })
    expect(tracker.get()).toEqual({ value: 0.1, time: 100 })
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
    tracker.process({
      value: 0.1,
      hadRecentInput: false,
      startTime: 0,
      sources: [{ node: div, previousRect: rect(0, 0, 10, 10), currentRect: rect(10, 0, 10, 10) }],
    })
    expect(tracker.get()!.targetSelector).toBe('div')
  })

  it('updates targetSelector to largest shift in window', () => {
    const tracker = trackCls()
    const img = { tagName: 'IMG' } as Element
    const p = { tagName: 'P' } as Element
    tracker.process({
      value: 0.1,
      hadRecentInput: false,
      startTime: 0,
      sources: [{ node: p, previousRect: rect(0, 0, 10, 10), currentRect: rect(10, 0, 10, 10) }],
    })
    tracker.process({
      value: 0.3,
      hadRecentInput: false,
      startTime: 200,
      sources: [{ node: img, previousRect: rect(0, 0, 20, 20), currentRect: rect(20, 0, 20, 20) }],
    })
    // img had the larger individual shift (0.3 > 0.1)
    expect(tracker.get()!.targetSelector).toBe('img')
  })

  it('tracks previousRect and currentRect from the top impacted source', () => {
    const tracker = trackCls()
    const div = { tagName: 'DIV' } as Element
    tracker.process({
      value: 0.1,
      hadRecentInput: false,
      startTime: 100,
      sources: [{ node: div, previousRect: rect(0, 0, 50, 50), currentRect: rect(50, 0, 50, 50) }],
    })
    const result = tracker.get()!
    expect(result.previousRect).toEqual({ x: 0, y: 0, width: 50, height: 50 })
    expect(result.currentRect).toEqual({ x: 50, y: 0, width: 50, height: 50 })
  })

  it('selects source with largest impacted area', () => {
    const tracker = trackCls()
    const small = { tagName: 'SPAN' } as Element
    const large = { tagName: 'DIV' } as Element
    tracker.process({
      value: 0.1,
      hadRecentInput: false,
      startTime: 100,
      sources: [
        { node: small, previousRect: rect(0, 0, 10, 10), currentRect: rect(10, 0, 10, 10) },
        { node: large, previousRect: rect(0, 0, 100, 100), currentRect: rect(100, 0, 100, 100) },
      ],
    })
    const result = tracker.get()!
    expect(result.targetSelector).toBe('div')
    expect(result.previousRect).toEqual({ x: 0, y: 0, width: 100, height: 100 })
    expect(result.currentRect).toEqual({ x: 100, y: 0, width: 100, height: 100 })
  })

  it('falls back to first source when no sources have nodes', () => {
    const tracker = trackCls()
    tracker.process({
      value: 0.1,
      hadRecentInput: false,
      startTime: 100,
      sources: [
        { previousRect: rect(0, 0, 10, 10), currentRect: rect(10, 0, 10, 10) },
        { previousRect: rect(0, 0, 100, 100), currentRect: rect(100, 0, 100, 100) },
      ],
    })
    const result = tracker.get()!
    // No node → targetSelector is undefined, but rects come from first source
    expect(result.targetSelector).toBeUndefined()
    expect(result.previousRect).toEqual({ x: 0, y: 0, width: 10, height: 10 })
    expect(result.currentRect).toEqual({ x: 10, y: 0, width: 10, height: 10 })
  })

  it('updates rects when a larger shift replaces the largest in the same window', () => {
    const tracker = trackCls()
    const a = { tagName: 'A' } as Element
    const b = { tagName: 'B' } as Element
    tracker.process({
      value: 0.1,
      hadRecentInput: false,
      startTime: 0,
      sources: [{ node: a, previousRect: rect(0, 0, 10, 10), currentRect: rect(10, 0, 10, 10) }],
    })
    tracker.process({
      value: 0.3,
      hadRecentInput: false,
      startTime: 200,
      sources: [{ node: b, previousRect: rect(0, 0, 50, 50), currentRect: rect(50, 0, 50, 50) }],
    })
    const result = tracker.get()!
    // Second shift was larger (0.3 > 0.1) → rects from second shift
    expect(result.previousRect).toEqual({ x: 0, y: 0, width: 50, height: 50 })
    expect(result.currentRect).toEqual({ x: 50, y: 0, width: 50, height: 50 })
  })

  it('rects follow the max window, not the current window', () => {
    const tracker = trackCls()
    const big = { tagName: 'DIV' } as Element
    const small = { tagName: 'SPAN' } as Element
    // First window: large value
    tracker.process({
      value: 0.5,
      hadRecentInput: false,
      startTime: 0,
      sources: [{ node: big, previousRect: rect(0, 0, 200, 200), currentRect: rect(200, 0, 200, 200) }],
    })
    // Start new window (>1s gap) with smaller value
    tracker.process({
      value: 0.1,
      hadRecentInput: false,
      startTime: 2000,
      sources: [{ node: small, previousRect: rect(0, 0, 5, 5), currentRect: rect(5, 0, 5, 5) }],
    })
    const result = tracker.get()!
    // Max window is first → rects from first shift
    expect(result.targetSelector).toBe('div')
    expect(result.previousRect).toEqual({ x: 0, y: 0, width: 200, height: 200 })
    expect(result.currentRect).toEqual({ x: 200, y: 0, width: 200, height: 200 })
  })

  it('returns no rects when sources are not provided', () => {
    const tracker = trackCls()
    tracker.process({ value: 0.1, hadRecentInput: false, startTime: 100 })
    const result = tracker.get()!
    expect(result.previousRect).toBeUndefined()
    expect(result.currentRect).toBeUndefined()
  })
})
