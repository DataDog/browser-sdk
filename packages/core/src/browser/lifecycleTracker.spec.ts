import { createNewEvent, registerCleanupTask } from '../../test'
import type { Configuration } from '../domain/configuration'
import {
  getLifecycleContext,
  resetLifecycleTracker,
  startLifecycleTracker,
  type LifecycleContext,
} from './lifecycleTracker'

const configuration = {} as Configuration

describe('lifecycleTracker', () => {
  beforeEach(() => {
    resetLifecycleTracker()
    registerCleanupTask(() => resetLifecycleTracker())
  })

  it('reports no event before any fires', () => {
    startLifecycleTracker(configuration)

    const ctx = getLifecycleContext()
    expect(ctx.lastLifecycleEvent).toBeUndefined()
    expect(ctx.timeSinceLifecycleEvent).toBeUndefined()
    expect(ctx.restoredFromBfcache).toBeFalse()
    expect(ctx.wasPrerendered).toBeFalse()
  })

  it('captures the most recent lifecycle event', () => {
    startLifecycleTracker(configuration)

    window.dispatchEvent(createNewEvent('pagehide'))

    const ctx = getLifecycleContext()
    expect(ctx.lastLifecycleEvent).toBe('pagehide')
    expect(ctx.timeSinceLifecycleEvent).toBeGreaterThanOrEqual(0)
  })

  it('overwrites lastLifecycleEvent on subsequent events', () => {
    startLifecycleTracker(configuration)

    window.dispatchEvent(createNewEvent('pagehide'))
    window.dispatchEvent(createNewEvent('pageshow'))

    expect(getLifecycleContext().lastLifecycleEvent).toBe('pageshow')
  })

  it('flips restoredFromBfcache when pageshow.persisted is true', () => {
    startLifecycleTracker(configuration)

    const event = createNewEvent('pageshow') as Event & { persisted?: boolean }
    Object.defineProperty(event, 'persisted', { value: true })
    window.dispatchEvent(event)

    expect(getLifecycleContext().restoredFromBfcache).toBeTrue()
  })

  it('does not flip restoredFromBfcache on non-persisted pageshow', () => {
    startLifecycleTracker(configuration)

    window.dispatchEvent(createNewEvent('pageshow'))

    expect(getLifecycleContext().restoredFromBfcache).toBeFalse()
  })

  it('is idempotent across multiple start calls', () => {
    startLifecycleTracker(configuration)
    startLifecycleTracker(configuration)

    window.dispatchEvent(createNewEvent('visibilitychange'))

    expect(getLifecycleContext().lastLifecycleEvent).toBe('visibilitychange')
  })

  it('returns a fresh snapshot every call', () => {
    startLifecycleTracker(configuration)
    const a: LifecycleContext = getLifecycleContext()
    const b: LifecycleContext = getLifecycleContext()
    expect(a).not.toBe(b)
  })
})
