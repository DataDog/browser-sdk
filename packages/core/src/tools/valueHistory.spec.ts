import type { Clock } from '../../test'
import { mockClock } from '../../test'
import type { Duration, RelativeTime } from './utils/timeUtils'
import { addDuration, ONE_MINUTE } from './utils/timeUtils'
import { CLEAR_OLD_VALUES_INTERVAL, type ValueHistory, valueHistoryFactory } from './valueHistory'

const EXPIRE_DELAY = 10 * ONE_MINUTE
const MAX_ENTRIES = 5

describe('valueHistory', () => {
  let valueHistory: ValueHistory<string>
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    valueHistory = valueHistoryFactory({ expireDelay: EXPIRE_DELAY, maxEntries: MAX_ENTRIES })
  })

  afterEach(() => {
    valueHistory.stop()
    clock.cleanup()
  })

  describe('find', () => {
    it('should return undefined when there is no active entry and no startTime', () => {
      expect(valueHistory.find()).toBeUndefined()
    })

    it('should return the value of the first active entry when there is no startTime', () => {
      valueHistory.add('foo', 0 as RelativeTime)

      expect(valueHistory.find()).toEqual('foo')
    })

    it('should return undefined if the most recent entry is closed and no startTime', () => {
      valueHistory.add('foo', 0 as RelativeTime).close(5 as RelativeTime)

      expect(valueHistory.find()).toBeUndefined()
    })

    it('should return the value of entries matching startTime', () => {
      valueHistory.add('foo', 0 as RelativeTime).close(5 as RelativeTime)
      valueHistory.add('bar', 5 as RelativeTime).close(10 as RelativeTime)
      valueHistory.add('qux', 10 as RelativeTime)

      expect(valueHistory.find(2 as RelativeTime)).toEqual('foo')
      expect(valueHistory.find(7 as RelativeTime)).toEqual('bar')
      expect(valueHistory.find(10 as RelativeTime)).toEqual('qux')
    })

    it('should return undefined when no entries matches startTime', () => {
      valueHistory.add('foo', 0 as RelativeTime).close(10 as RelativeTime)
      valueHistory.add('bar', 20 as RelativeTime)

      expect(valueHistory.find(15 as RelativeTime)).toBeUndefined()
    })

    describe('with `option.returnInactive` true', () => {
      it('should return the value of the closest entry regardless of the being closed', () => {
        valueHistory.add('foo', 0 as RelativeTime).close(10 as RelativeTime)
        valueHistory.add('bar', 20 as RelativeTime)
        expect(valueHistory.find(15 as RelativeTime, { returnInactive: true })).toEqual('foo')
      })
    })
  })

  describe('findAll', () => {
    it('should return an empty array when there is no active entry and no startTime', () => {
      expect(valueHistory.findAll()).toEqual([])
    })

    it('should return all active entry value when there is no startTime', () => {
      valueHistory.add('foo', 0 as RelativeTime)
      valueHistory.add('bar', 5 as RelativeTime).close(10 as RelativeTime)
      valueHistory.add('qux', 10 as RelativeTime)

      expect(valueHistory.findAll()).toEqual(['qux', 'foo'])
    })

    it('should return the entries of entries matching startTime', () => {
      valueHistory.add('foo', 0 as RelativeTime).close(6 as RelativeTime)
      valueHistory.add('bar', 5 as RelativeTime).close(8 as RelativeTime)
      valueHistory.add('qux', 10 as RelativeTime)

      expect(valueHistory.findAll(2 as RelativeTime)).toEqual(['foo'])
      expect(valueHistory.findAll(5 as RelativeTime)).toEqual(['bar', 'foo'])
      expect(valueHistory.findAll(7 as RelativeTime)).toEqual(['bar'])
      expect(valueHistory.findAll(9 as RelativeTime)).toEqual([])
      expect(valueHistory.findAll(10 as RelativeTime)).toEqual(['qux'])
    })

    it('should return an empty array when no entry is matching startTime', () => {
      valueHistory.add('foo', 0 as RelativeTime).close(10 as RelativeTime)
      valueHistory.add('bar', 20 as RelativeTime)

      expect(valueHistory.findAll(15 as RelativeTime)).toEqual([])
    })

    it('should return all context overlapping with the duration', () => {
      valueHistory.add('foo', 0 as RelativeTime)
      valueHistory.add('bar', 5 as RelativeTime).close(10 as RelativeTime)
      valueHistory.add('baz', 10 as RelativeTime).close(15 as RelativeTime)
      valueHistory.add('qux', 15 as RelativeTime)

      expect(valueHistory.findAll(0 as RelativeTime, 20 as Duration)).toEqual(['qux', 'baz', 'bar', 'foo'])
      expect(valueHistory.findAll(6 as RelativeTime, 5 as Duration)).toEqual(['baz', 'bar', 'foo'])
      expect(valueHistory.findAll(11 as RelativeTime, 5 as Duration)).toEqual(['qux', 'baz', 'foo'])
    })
  })

  describe('removing entries', () => {
    it('should not return removed entries', () => {
      valueHistory.add('foo', 0 as RelativeTime).remove()
      expect(valueHistory.find()).toBeUndefined()
    })

    it('removing an entry twice should not impact other entries', () => {
      valueHistory.add('bar', 5 as RelativeTime)
      const entry = valueHistory.add('foo', 0 as RelativeTime)
      entry.remove()
      entry.remove()
      expect(valueHistory.find()).toEqual('bar')
    })
  })

  it('should reset values', () => {
    valueHistory.add('foo', 0 as RelativeTime).close(10 as RelativeTime)
    valueHistory.add('bar', 10 as RelativeTime)

    valueHistory.reset()

    expect(valueHistory.find()).toBeUndefined()
    expect(valueHistory.find(0 as RelativeTime)).toBeUndefined()
  })

  it('should clear old values', () => {
    const originalTime = performance.now() as RelativeTime
    valueHistory.add('foo', originalTime).close(addDuration(originalTime, 10 as Duration))
    clock.tick(10)

    expect(valueHistory.find(originalTime)).toBeDefined()

    clock.tick(EXPIRE_DELAY + CLEAR_OLD_VALUES_INTERVAL)

    expect(valueHistory.find(originalTime)).toBeUndefined()
  })

  it('should limit the number of entries', () => {
    for (let i = 0; i < MAX_ENTRIES + 1; i++) {
      valueHistory.add(`${i}`, 0 as RelativeTime)
    }
    const values = valueHistory.findAll()
    expect(values.length).toEqual(5)
    expect(values).toEqual(['5', '4', '3', '2', '1'])
  })
})
