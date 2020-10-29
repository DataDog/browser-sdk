import { objectValues } from '@datadog/browser-core'
import { RawRumEvent, RumEventCategory } from '../types'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { EventCounts, trackEventCounts } from './trackEventCounts'

describe('trackEventCounts', () => {
  let lifeCycle: LifeCycle

  beforeEach(() => {
    lifeCycle = new LifeCycle()
  })

  function notifyCollectedRawRumEvent(category: RumEventCategory) {
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      rawRumEvent: ({ evt: { category } } as unknown) as RawRumEvent,
      startTime: 0,
    })
  }

  it('tracks errors', () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    notifyCollectedRawRumEvent(RumEventCategory.ERROR)
    expect(eventCounts.errorCount).toBe(1)
  })

  it('tracks long tasks', () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    notifyCollectedRawRumEvent(RumEventCategory.LONG_TASK)
    expect(eventCounts.longTaskCount).toBe(1)
  })

  it("doesn't track views", () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    notifyCollectedRawRumEvent(RumEventCategory.VIEW)
    expect(objectValues(eventCounts).every((value) => value === 0)).toBe(true)
  })

  it('tracks actions', () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    notifyCollectedRawRumEvent(RumEventCategory.USER_ACTION)
    expect(eventCounts.userActionCount).toBe(1)
  })

  it('tracks resources', () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    notifyCollectedRawRumEvent(RumEventCategory.RESOURCE)
    expect(eventCounts.resourceCount).toBe(1)
  })

  it('stops tracking when stop is called', () => {
    const { eventCounts, stop } = trackEventCounts(lifeCycle)
    notifyCollectedRawRumEvent(RumEventCategory.RESOURCE)
    expect(eventCounts.resourceCount).toBe(1)
    stop()
    notifyCollectedRawRumEvent(RumEventCategory.RESOURCE)
    expect(eventCounts.resourceCount).toBe(1)
  })

  it('invokes a potential callback when a count is increased', () => {
    const spy = jasmine.createSpy<(eventCounts: EventCounts) => void>()
    trackEventCounts(lifeCycle, spy)

    notifyCollectedRawRumEvent(RumEventCategory.RESOURCE)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.calls.mostRecent().args[0].resourceCount).toBe(1)

    notifyCollectedRawRumEvent(RumEventCategory.RESOURCE)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.calls.mostRecent().args[0].resourceCount).toBe(2)
  })
})
