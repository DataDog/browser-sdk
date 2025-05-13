import type { Context } from '@flashcatcloud/browser-core'
import { objectValues } from '@flashcatcloud/browser-core'
import type { RumEvent } from '../rumEvent.types'
import { FrustrationType, RumEventType } from '../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
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
    const { eventCounts } = trackEventCounts({ lifeCycle, isChildEvent: () => true })
    notifyCollectedRawRumEvent({ type: RumEventType.ERROR })
    expect(eventCounts.errorCount).toBe(1)
  })

  it('tracks long tasks', () => {
    const { eventCounts } = trackEventCounts({ lifeCycle, isChildEvent: () => true })
    notifyCollectedRawRumEvent({ type: RumEventType.LONG_TASK })
    expect(eventCounts.longTaskCount).toBe(1)
  })
  ;[RumEventType.VIEW, RumEventType.VITAL].forEach((eventType) => {
    it(`doesn't track ${eventType} events`, () => {
      const { eventCounts } = trackEventCounts({ lifeCycle, isChildEvent: () => true })
      notifyCollectedRawRumEvent({ type: eventType })
      expect(objectValues(eventCounts as unknown as { [key: string]: number }).every((value) => value === 0)).toBe(true)
    })
  })

  it('tracks actions', () => {
    const { eventCounts } = trackEventCounts({ lifeCycle, isChildEvent: () => true })
    notifyCollectedRawRumEvent({ type: RumEventType.ACTION, action: { type: 'custom' } })
    expect(eventCounts.actionCount).toBe(1)
  })

  it('tracks non-discarded resources', () => {
    const { eventCounts } = trackEventCounts({ lifeCycle, isChildEvent: () => true })
    notifyCollectedRawRumEvent({ type: RumEventType.RESOURCE })
    expect(eventCounts.resourceCount).toBe(1)
  })

  it('does not track discarded resources', () => {
    const { eventCounts } = trackEventCounts({ lifeCycle, isChildEvent: () => true })
    notifyCollectedRawRumEvent({ type: RumEventType.RESOURCE, _dd: { discarded: true, format_version: 2 } })
    expect(eventCounts.resourceCount).toBe(0)
  })

  it('tracks frustration counts', () => {
    const { eventCounts } = trackEventCounts({ lifeCycle, isChildEvent: () => true })
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
    const { eventCounts, stop } = trackEventCounts({ lifeCycle, isChildEvent: () => true })
    notifyCollectedRawRumEvent({ type: RumEventType.RESOURCE })
    expect(eventCounts.resourceCount).toBe(1)
    stop()
    notifyCollectedRawRumEvent({ type: RumEventType.RESOURCE })
    expect(eventCounts.resourceCount).toBe(1)
  })

  it('invokes a potential callback when a count is increased', () => {
    const spy = jasmine.createSpy<() => void>()
    trackEventCounts({ lifeCycle, isChildEvent: () => true, onChange: spy })

    notifyCollectedRawRumEvent({ type: RumEventType.RESOURCE })
    expect(spy).toHaveBeenCalledTimes(1)

    notifyCollectedRawRumEvent({ type: RumEventType.RESOURCE })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('does not take into account events that are not child events', () => {
    const { eventCounts } = trackEventCounts({ lifeCycle, isChildEvent: () => false })
    notifyCollectedRawRumEvent({ type: RumEventType.RESOURCE })
    expect(eventCounts.resourceCount).toBe(0)
  })
})
