import { ErrorMessage, objectValues } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '../src/lifeCycle'
import { EventCounts, trackEventCounts } from '../src/trackEventCounts'
import { AutoUserAction, CustomUserAction } from '../src/userActionCollection'

describe('trackEventCounts', () => {
  let lifeCycle: LifeCycle

  beforeEach(() => {
    lifeCycle = new LifeCycle()
  })

  it('tracks errors', () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    const error = {}
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, error as ErrorMessage)
    expect(eventCounts.errorCount).toBe(1)
  })

  it('tracks long tasks', () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    const performanceEntry = { entryType: 'longtask' }
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, performanceEntry as PerformanceEntry)
    expect(eventCounts.longTaskCount).toBe(1)
  })

  it("doesn't track navigation entries", () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    const performanceEntry = { entryType: 'navigation' }
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, performanceEntry as PerformanceEntry)
    expect(objectValues(eventCounts).every((value) => value === 0)).toBe(true)
  })

  it('tracks user actions', () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    const userAction = {}
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, userAction as AutoUserAction)
    lifeCycle.notify(LifeCycleEventType.CUSTOM_ACTION_COLLECTED, userAction as CustomUserAction)
    expect(eventCounts.userActionCount).toBe(2)
  })

  it('tracks resources', () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    expect(eventCounts.resourceCount).toBe(1)
  })

  it('stops tracking when stop is called', () => {
    const { eventCounts, stop } = trackEventCounts(lifeCycle)
    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    expect(eventCounts.resourceCount).toBe(1)
    stop()
    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    expect(eventCounts.resourceCount).toBe(1)
  })

  it('invokes a potential callback when a count is increased', () => {
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
