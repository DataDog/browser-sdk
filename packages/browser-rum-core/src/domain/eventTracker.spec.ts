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

    it('should compute duration from timestamps, not relative times', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      tracker.start('key1', startClocks, { value: 'data1' })

      const endClocks = { relative: 300 as RelativeTime, timeStamp: 1050 as TimeStamp }

      const stopped = tracker.stop('key1', endClocks)

      expect(stopped?.duration).toBe(50 as Duration)
    })
  })

  describe('findId', () => {
    it('should return empty array when no events are tracked', () => {
      expect(tracker.findId()).toEqual([])
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
      expect(tracker.findId(250 as RelativeTime)).toEqual([])
    })

    it('should not include discarded events', () => {
      tracker.start('key1', clocksNow(), { value: 'data' })
      tracker.discard('key1')

      expect(tracker.findId()).toEqual([])
    })
  })

  describe('stopAll', () => {
    it('should clear all events', () => {
      const startClocks = clocksNow()

      tracker.start('key1', startClocks, { value: 'data1' })
      tracker.start('key2', startClocks, { value: 'data2' })

      tracker.stopAll()

      expect(tracker.stop('key1', clocksNow())).toBeUndefined()
      expect(tracker.stop('key2', clocksNow())).toBeUndefined()
    })

    it('should unsubscribe from session renewal events', () => {
      tracker.start('key1', clocksNow(), { value: 'data1' })

      tracker.stopAll()

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      expect(tracker.findId()).toEqual([])
    })
  })
})
