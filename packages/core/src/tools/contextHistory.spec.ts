import type { Clock } from '../../test/specHelper'
import { mockClock } from '../../test/specHelper'
import type { RelativeTime } from './timeUtils'
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
    it('should return undefined when there is no current and no startTime', () => {
      expect(contextHistory.find()).toBeUndefined()
    })

    it('should return current when there is no startTime', () => {
      contextHistory.setCurrent('foo', 0 as RelativeTime)

      expect(contextHistory.find()).toEqual('foo')
    })

    it('should return undefined if current is closed and no startTime', () => {
      contextHistory.setCurrent('foo', 0 as RelativeTime)
      contextHistory.closeCurrent(5 as RelativeTime)

      expect(contextHistory.find()).toBeUndefined()
    })

    it('should return the context corresponding to startTime', () => {
      contextHistory.setCurrent('foo', 0 as RelativeTime)
      contextHistory.closeCurrent(5 as RelativeTime)
      contextHistory.setCurrent('bar', 5 as RelativeTime)
      contextHistory.closeCurrent(10 as RelativeTime)
      contextHistory.setCurrent('qux', 10 as RelativeTime)

      expect(contextHistory.find(2 as RelativeTime)).toEqual('foo')
      expect(contextHistory.find(7 as RelativeTime)).toEqual('bar')
      expect(contextHistory.find(10 as RelativeTime)).toEqual('qux')
    })

    it('should return undefined when no context corresponding to startTime', () => {
      contextHistory.setCurrent('foo', 0 as RelativeTime)
      contextHistory.closeCurrent(10 as RelativeTime)
      contextHistory.setCurrent('bar', 20 as RelativeTime)

      expect(contextHistory.find(15 as RelativeTime)).toBeUndefined()
    })
  })

  it('should reset contexts', () => {
    contextHistory.setCurrent('foo', 0 as RelativeTime)
    contextHistory.closeCurrent(10 as RelativeTime)
    contextHistory.setCurrent('bar', 10 as RelativeTime)

    contextHistory.reset()

    expect(contextHistory.getCurrent()).toBeUndefined()
    expect(contextHistory.find(0 as RelativeTime)).toBeUndefined()
  })

  it('should clear old contexts', () => {
    const originalTime = performance.now() as RelativeTime
    contextHistory.setCurrent('foo', originalTime)
    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    contextHistory.closeCurrent((originalTime + 10) as RelativeTime)
    clock.tick(10)

    expect(contextHistory.find(originalTime)).toBeDefined()

    clock.tick(EXPIRE_DELAY + CLEAR_OLD_CONTEXTS_INTERVAL)

    expect(contextHistory.find(originalTime)).toBeUndefined()
  })
})
