import { ErrorMessage, objectValues } from '@datadog/browser-core'
import { RumPerformanceLongTaskTiming, RumPerformanceNavigationTiming } from '../browser/performanceCollection'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { AutoUserAction, CustomUserAction } from './rumEventsCollection/userActionCollection'
import { EventCounts, trackEventCounts } from './trackEventCounts'

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
    const performanceTiming = { entryType: 'longtask' }
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, performanceTiming as RumPerformanceLongTaskTiming)
    expect(eventCounts.longTaskCount).toBe(1)
  })

  it("doesn't track navigation entries", () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    const performanceTiming = { entryType: 'navigation' }
    lifeCycle.notify(
      LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
      performanceTiming as RumPerformanceNavigationTiming
    )
    expect(objectValues(eventCounts).every((value) => value === 0)).toBe(true)
  })

  it('tracks user actions', () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    const userAction = {}
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, userAction as AutoUserAction)
    lifeCycle.notify(LifeCycleEventType.CUSTOM_ACTION_COLLECTED, {
      action: userAction as CustomUserAction,
      context: {},
    })
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
