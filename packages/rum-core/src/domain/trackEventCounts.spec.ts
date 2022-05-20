import type { Context } from '@datadog/browser-core'
import { objectValues } from '@datadog/browser-core'
import type { RumEvent } from '../rumEvent.types'
import { FrustrationType, RumEventType } from '../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import type { EventCounts } from './trackEventCounts'
import { trackEventCounts } from './trackEventCounts'

describe('trackEventCounts', () => {
  let lifeCycle: LifeCycle

  beforeEach(() => {
    lifeCycle = new LifeCycle()
  })

  function notifyCollectedRawRumEvent(partialEvent: Partial<RumEvent>) {
    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, partialEvent as RumEvent & Context)
  }

  it('tracks errors', () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    notifyCollectedRawRumEvent({ type: RumEventType.ERROR })
    expect(eventCounts.errorCount).toBe(1)
  })

  it('tracks long tasks', () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    notifyCollectedRawRumEvent({ type: RumEventType.LONG_TASK })
    expect(eventCounts.longTaskCount).toBe(1)
  })

  it("doesn't track views", () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    notifyCollectedRawRumEvent({ type: RumEventType.VIEW })
    expect(objectValues(eventCounts as unknown as { [key: string]: number }).every((value) => value === 0)).toBe(true)
  })

  it('tracks actions', () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    notifyCollectedRawRumEvent({ type: RumEventType.ACTION, action: { type: 'custom' } })
    expect(eventCounts.actionCount).toBe(1)
  })

  it('tracks resources', () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    notifyCollectedRawRumEvent({ type: RumEventType.RESOURCE })
    expect(eventCounts.resourceCount).toBe(1)
  })

  it('tracks frustration counts', () => {
    const { eventCounts } = trackEventCounts(lifeCycle)
    notifyCollectedRawRumEvent({
      type: RumEventType.ACTION,
      action: {
        type: 'click',
        frustration: {
          type: [FrustrationType.ERROR_CLICK, FrustrationType.DEAD_CLICK],
        },
      },
    })
    expect(eventCounts.frustrationCount).toBe(2)
  })

  it('stops tracking when stop is called', () => {
    const { eventCounts, stop } = trackEventCounts(lifeCycle)
    notifyCollectedRawRumEvent({ type: RumEventType.RESOURCE })
    expect(eventCounts.resourceCount).toBe(1)
    stop()
    notifyCollectedRawRumEvent({ type: RumEventType.RESOURCE })
    expect(eventCounts.resourceCount).toBe(1)
  })

  it('invokes a potential callback when a count is increased', () => {
    const spy = jasmine.createSpy<(eventCounts: EventCounts) => void>()
    trackEventCounts(lifeCycle, spy)

    notifyCollectedRawRumEvent({ type: RumEventType.RESOURCE })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.calls.mostRecent().args[0].resourceCount).toBe(1)

    notifyCollectedRawRumEvent({ type: RumEventType.RESOURCE })
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.calls.mostRecent().args[0].resourceCount).toBe(2)
  })
})
