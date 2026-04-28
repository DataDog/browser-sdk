import { trackLcp } from './trackLcp'

describe('trackLcp', () => {
  it('returns undefined with no entries', () => {
    const tracker = trackLcp()
    expect(tracker.get()).toBeUndefined()
  })

  it('returns latest entry value', () => {
    const tracker = trackLcp()
    tracker.process({ startTime: 1500, size: 200 })
    expect(tracker.get()).toEqual({ value: 1500 })
  })

  it('replaces previous value with newer entry', () => {
    const tracker = trackLcp()
    tracker.process({ startTime: 1000, size: 100 })
    tracker.process({ startTime: 2500, size: 400 })
    expect(tracker.get()!.value).toBe(2500)
  })

  it('ignores entries after stop()', () => {
    const tracker = trackLcp()
    tracker.process({ startTime: 1000, size: 100 })
    tracker.stop()
    tracker.process({ startTime: 3000, size: 800 })
    expect(tracker.get()!.value).toBe(1000)
  })

  it('sets targetSelector from element tagName', () => {
    const tracker = trackLcp()
    const img = { tagName: 'IMG' } as Element
    tracker.process({ startTime: 2000, size: 500, element: img })
    expect(tracker.get()!.targetSelector).toBe('img')
  })

  it('has no targetSelector when element is absent', () => {
    const tracker = trackLcp()
    tracker.process({ startTime: 1000, size: 200 })
    expect(tracker.get()!.targetSelector).toBeUndefined()
  })
})
