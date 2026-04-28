import { trackFcp } from './trackFcp'

describe('trackFcp', () => {
  it('returns undefined before any entry', () => {
    const tracker = trackFcp()
    expect(tracker.get()).toBeUndefined()
  })

  it('returns startTime for first-contentful-paint entry', () => {
    const tracker = trackFcp()
    tracker.process({ name: 'first-contentful-paint', startTime: 1200 })
    expect(tracker.get()).toBe(1200)
  })

  it('ignores entries with wrong name', () => {
    const tracker = trackFcp()
    tracker.process({ name: 'first-paint', startTime: 500 })
    expect(tracker.get()).toBeUndefined()
  })

  it('discards entries older than 10 minutes', () => {
    const tracker = trackFcp()
    tracker.process({ name: 'first-contentful-paint', startTime: 600001 })
    expect(tracker.get()).toBeUndefined()
  })

  it('accepts entries at exactly the 10 minute boundary', () => {
    const tracker = trackFcp()
    tracker.process({ name: 'first-contentful-paint', startTime: 600000 })
    expect(tracker.get()).toBe(600000)
  })

  it('only keeps first value', () => {
    const tracker = trackFcp()
    tracker.process({ name: 'first-contentful-paint', startTime: 1000 })
    tracker.process({ name: 'first-contentful-paint', startTime: 2000 })
    expect(tracker.get()).toBe(1000)
  })
})
