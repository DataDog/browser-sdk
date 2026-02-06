import type { Duration, RelativeTime, TimeStamp } from '@datadog/browser-core'
import { clocksNow } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import type { EventTracker } from './eventTracker'
import { startEventTracker } from './eventTracker'

describe('eventTracker', () => {
  let lifeCycle: LifeCycle
  let tracker: EventTracker<{ value?: string; extra?: string }>
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    lifeCycle = new LifeCycle()
    tracker = startEventTracker(lifeCycle)
    registerCleanupTask(() => tracker.stopAll())
  })

  describe('start', () => {
    it('should generate a unique ID for each event', () => {
      const startClocks = clocksNow()
      tracker.start('key1', startClocks, { value: 'data1' })
      tracker.start('key2', startClocks, { value: 'data2' })

      const stopped1 = tracker.stop('key1', startClocks)
      const stopped2 = tracker.stop('key2', startClocks)

      expect(stopped1?.id).toBeDefined()
      expect(stopped2?.id).toBeDefined()
      expect(stopped1?.id).not.toBe(stopped2?.id)
    })

    it('should disable event counting by default', () => {
      const startClocks = clocksNow()
      tracker.start('key1', startClocks, { value: 'data' })

      const stopped = tracker.stop('key1', clocksNow())

      expect(stopped?.counts).toBeUndefined()
    })

    it('should enable event counting when isChildEvent is provided', () => {
      const startClocks = clocksNow()
      tracker.start('key1', startClocks, { value: 'data' }, { isChildEvent: () => () => true })

      const stopped = tracker.stop('key1', clocksNow())

      expect(stopped?.counts).toBeDefined()
      expect(stopped?.counts?.errorCount).toBe(0)
    })

    it('should overwrite existing event with same key and call onDiscard', () => {
      const onDiscard = jasmine.createSpy('onDiscard')
      const startClocks = clocksNow()

      tracker.start('key1', startClocks, { value: 'original' }, { onDiscard })
      tracker.start('key1', startClocks, { value: 'updated' })

      const stopped = tracker.stop('key1', clocksNow())

      expect(stopped?.value).toBe('updated')
      expect(onDiscard).toHaveBeenCalledOnceWith(jasmine.any(String), { value: 'original' }, startClocks)
    })
  })

  describe('stop', () => {
    it('should return undefined for non-existent key', () => {
      expect(tracker.stop('non-existent', clocksNow())).toBeUndefined()
    })

    it('should return stopped event with correct structure', () => {
      const startClocks = clocksNow()
      tracker.start('key1', startClocks, { value: 'data1' })
      clock.tick(500)

      const stopped = tracker.stop('key1', clocksNow())

      expect(stopped).toEqual({
        id: jasmine.any(String),
        startClocks,
        duration: 500 as Duration,
        counts: undefined,
        value: 'data1',
      })
    })

    it('should merge extraData with start data', () => {
      tracker.start('key1', clocksNow(), { value: 'original' })

      const stopped = tracker.stop('key1', clocksNow(), { extra: 'additional' })

      expect(stopped).toEqual(
        jasmine.objectContaining({
          value: 'original',
          extra: 'additional',
        })
      )
    })

    it('should not call onDiscard when stopping normally', () => {
      const onDiscard = jasmine.createSpy('onDiscard')
      tracker.start('key1', clocksNow(), { value: 'data1' }, { onDiscard })

      tracker.stop('key1', clocksNow())

      expect(onDiscard).not.toHaveBeenCalled()
    })
  })

  describe('discard', () => {
    it('should remove event and call onDiscard callback', () => {
      const onDiscard = jasmine.createSpy('onDiscard')
      const startClocks = clocksNow()
      tracker.start('key1', startClocks, { value: 'data1' }, { onDiscard })

      tracker.discard('key1')

      expect(tracker.stop('key1', clocksNow())).toBeUndefined()
      expect(onDiscard).toHaveBeenCalledOnceWith(jasmine.any(String), { value: 'data1' }, startClocks)
    })
  })

  describe('findId', () => {
    it('should return undefined when no events are tracked', () => {
      expect(tracker.findId()).toBeUndefined()
    })

    it('should return array of IDs for active events', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      tracker.start('key1', startClocks, { value: 'data1' })
      tracker.start('key2', startClocks, { value: 'data2' })

      const result = tracker.findId()

      expect(Array.isArray(result)).toBeTrue()
      expect(result).toHaveSize(2)
    })

    it('should find events within their time range', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      tracker.start('key1', startClocks, { value: 'data' })
      const stopped = tracker.stop('key1', { relative: 200 as RelativeTime, timeStamp: 2000 as TimeStamp })

      expect(tracker.findId(150 as RelativeTime)).toEqual([stopped!.id])
      expect(tracker.findId(250 as RelativeTime)).toBeUndefined()
    })

    it('should not include discarded events', () => {
      tracker.start('key1', clocksNow(), { value: 'data' })
      tracker.discard('key1')

      expect(tracker.findId()).toBeUndefined()
    })
  })

  describe('stopAll', () => {
    it('should clear all events and call onDiscard for each', () => {
      const onDiscard1 = jasmine.createSpy('onDiscard1')
      const onDiscard2 = jasmine.createSpy('onDiscard2')
      const startClocks = clocksNow()

      tracker.start('key1', startClocks, { value: 'data1' }, { onDiscard: onDiscard1 })
      tracker.start('key2', startClocks, { value: 'data2' }, { onDiscard: onDiscard2 })

      tracker.stopAll()

      expect(tracker.stop('key1', clocksNow())).toBeUndefined()
      expect(tracker.stop('key2', clocksNow())).toBeUndefined()
      expect(onDiscard1).toHaveBeenCalledOnceWith(jasmine.any(String), { value: 'data1' }, startClocks)
      expect(onDiscard2).toHaveBeenCalledOnceWith(jasmine.any(String), { value: 'data2' }, startClocks)
    })

    it('should unsubscribe from session renewal events', () => {
      const onDiscard = jasmine.createSpy('onDiscard')
      tracker.start('key1', clocksNow(), { value: 'data1' }, { onDiscard })

      tracker.stopAll()
      onDiscard.calls.reset()

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      expect(onDiscard).not.toHaveBeenCalled()
    })
  })
})
