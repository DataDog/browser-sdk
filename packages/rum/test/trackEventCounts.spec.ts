import { ErrorMessage, objectValues } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '../src/lifeCycle'
import { EventCounts, trackEventCounts } from '../src/trackEventCounts'
import { UserAction } from '../src/userActionCollection'

describe('trackEventCounts', () => {
  it('tracks errors', () => {
    const lifeCycle = new LifeCycle()
    const { eventCounts } = trackEventCounts(lifeCycle)
    // tslint:disable-next-line no-object-literal-type-assertion
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, {} as ErrorMessage)
    expect(eventCounts.errorCount).toBe(1)
  })

  it('tracks long tasks', () => {
    const lifeCycle = new LifeCycle()
    const { eventCounts } = trackEventCounts(lifeCycle)
    // tslint:disable-next-line no-object-literal-type-assertion
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, { entryType: 'longtask' } as PerformanceEntry)
    expect(eventCounts.longTaskCount).toBe(1)
  })

  it("doesn't track navigation entries", () => {
    const lifeCycle = new LifeCycle()
    const { eventCounts } = trackEventCounts(lifeCycle)
    // tslint:disable-next-line no-object-literal-type-assertion
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, { entryType: 'navigation' } as PerformanceEntry)
    expect(objectValues(eventCounts).every((value) => value === 0)).toBe(true)
  })

  it('tracks user actions', () => {
    const lifeCycle = new LifeCycle()
    const { eventCounts } = trackEventCounts(lifeCycle)
    // tslint:disable-next-line no-object-literal-type-assertion
    lifeCycle.notify(LifeCycleEventType.USER_ACTION_COLLECTED, {} as UserAction)
    expect(eventCounts.userActionCount).toBe(1)
  })

  it('tracks resources', () => {
    const lifeCycle = new LifeCycle()
    const { eventCounts } = trackEventCounts(lifeCycle)
    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    expect(eventCounts.resourceCount).toBe(1)
  })

  it('stops tracking when stop is called', () => {
    const lifeCycle = new LifeCycle()
    const { eventCounts, stop } = trackEventCounts(lifeCycle)
    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    expect(eventCounts.resourceCount).toBe(1)
    stop()
    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    expect(eventCounts.resourceCount).toBe(1)
  })

  it('invokes a potential callback when a count is increased', () => {
    const lifeCycle = new LifeCycle()
    const spy = jasmine.createSpy<(eventCounts: EventCounts) => void>()
    trackEventCounts(lifeCycle, spy)

    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.calls.mostRecent().args[0].resourceCount).toBe(1)

    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.calls.mostRecent().args[0].resourceCount).toBe(2)
  })
})
