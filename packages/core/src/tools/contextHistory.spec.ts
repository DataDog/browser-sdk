import type { Clock } from '../../test/specHelper'
import { mockClock } from '../../test/specHelper'
import type { Duration, RelativeTime } from './timeUtils'
import { addDuration } from './timeUtils'
import { ONE_MINUTE } from './utils'
import { CLEAR_OLD_CONTEXTS_INTERVAL, ContextHistory } from './contextHistory'

const EXPIRE_DELAY = 10 * ONE_MINUTE

describe('contextHistory', () => {
  let contextHistory: ContextHistory<string>
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    contextHistory = new ContextHistory(EXPIRE_DELAY)
  })

  afterEach(() => {
    contextHistory.stop()
    clock.cleanup()
  })

  describe('find', () => {
    it('should return undefined when there is no active entry and no startTime', () => {
      expect(contextHistory.find()).toBeUndefined()
    })

    it('should return the context of the first active entry when there is no startTime', () => {
      contextHistory.add('foo', 0 as RelativeTime)

      expect(contextHistory.find()).toEqual('foo')
    })

    it('should return undefined if the most recent entry is closed and no startTime', () => {
      contextHistory.add('foo', 0 as RelativeTime).close(5 as RelativeTime)

      expect(contextHistory.find()).toBeUndefined()
    })

    it('should return the context of entries matching startTime', () => {
      contextHistory.add('foo', 0 as RelativeTime).close(5 as RelativeTime)
      contextHistory.add('bar', 5 as RelativeTime).close(10 as RelativeTime)
      contextHistory.add('qux', 10 as RelativeTime)

      expect(contextHistory.find(2 as RelativeTime)).toEqual('foo')
      expect(contextHistory.find(7 as RelativeTime)).toEqual('bar')
      expect(contextHistory.find(10 as RelativeTime)).toEqual('qux')
    })

    it('should return undefined when no entries matches startTime', () => {
      contextHistory.add('foo', 0 as RelativeTime).close(10 as RelativeTime)
      contextHistory.add('bar', 20 as RelativeTime)

      expect(contextHistory.find(15 as RelativeTime)).toBeUndefined()
    })
  })

  describe('findAll', () => {
    it('should return an empty array when there is no active entry and no startTime', () => {
      expect(contextHistory.findAll()).toEqual([])
    })

    it('should return all active entry context when there is no startTime', () => {
      contextHistory.add('foo', 0 as RelativeTime)
      contextHistory.add('bar', 5 as RelativeTime).close(10 as RelativeTime)
      contextHistory.add('qux', 10 as RelativeTime)

      expect(contextHistory.findAll()).toEqual(['qux', 'foo'])
    })

    it('should return the entries of entries matching startTime', () => {
      contextHistory.add('foo', 0 as RelativeTime).close(6 as RelativeTime)
      contextHistory.add('bar', 5 as RelativeTime).close(8 as RelativeTime)
      contextHistory.add('qux', 10 as RelativeTime)

      expect(contextHistory.findAll(2 as RelativeTime)).toEqual(['foo'])
      expect(contextHistory.findAll(5 as RelativeTime)).toEqual(['bar', 'foo'])
      expect(contextHistory.findAll(7 as RelativeTime)).toEqual(['bar'])
      expect(contextHistory.findAll(9 as RelativeTime)).toEqual([])
      expect(contextHistory.findAll(10 as RelativeTime)).toEqual(['qux'])
    })

    it('should return an empty array when no entry is matching startTime', () => {
      contextHistory.add('foo', 0 as RelativeTime).close(10 as RelativeTime)
      contextHistory.add('bar', 20 as RelativeTime)

      expect(contextHistory.findAll(15 as RelativeTime)).toEqual([])
    })
  })

  describe('removing entries', () => {
    it('should not return removed entries', () => {
      contextHistory.add('foo', 0 as RelativeTime).remove()
      expect(contextHistory.find()).toBeUndefined()
    })

    it('removing an entry twice should not impact other entries', () => {
      contextHistory.add('bar', 5 as RelativeTime)
      const entry = contextHistory.add('foo', 0 as RelativeTime)
      entry.remove()
      entry.remove()
      expect(contextHistory.find()).toEqual('bar')
    })
  })

  it('should reset contexts', () => {
    contextHistory.add('foo', 0 as RelativeTime).close(10 as RelativeTime)
    contextHistory.add('bar', 10 as RelativeTime)

    contextHistory.reset()

    expect(contextHistory.find()).toBeUndefined()
    expect(contextHistory.find(0 as RelativeTime)).toBeUndefined()
  })

  it('should clear old contexts', () => {
    const originalTime = performance.now() as RelativeTime
    contextHistory.add('foo', originalTime).close(addDuration(originalTime, 10 as Duration))
    clock.tick(10)

    expect(contextHistory.find(originalTime)).toBeDefined()

    clock.tick(EXPIRE_DELAY + CLEAR_OLD_CONTEXTS_INTERVAL)

    expect(contextHistory.find(originalTime)).toBeUndefined()
  })
})
