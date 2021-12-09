import { mockClock, Clock } from '../../test/specHelper'
import { RelativeTime } from './timeUtils'
import { ONE_MINUTE } from './utils'
import { CLEAR_OLD_CONTEXTS_INTERVAL, ContextHistory } from './contextHistory'

const EXPIRE_DELAY = 10 * ONE_MINUTE

describe('contextHistory', () => {
  let contextHistory: ContextHistory<{ value: string }>
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
    it('should return undefined when there is no current and no startClocks', () => {
      expect(contextHistory.find()).toBeUndefined()
    })

    it('should return current when there is no startClocks', () => {
      contextHistory.setCurrent({ value: 'foo' }, 0 as RelativeTime)

      expect(contextHistory.find()).toEqual({ value: 'foo' })
    })

    it('should return the context corresponding to startClocks', () => {
      contextHistory.setCurrent({ value: 'foo' }, 0 as RelativeTime)
      contextHistory.closeCurrent(5 as RelativeTime)
      contextHistory.setCurrent({ value: 'bar' }, 5 as RelativeTime)
      contextHistory.closeCurrent(10 as RelativeTime)
      contextHistory.setCurrent({ value: 'qux' }, 10 as RelativeTime)

      expect(contextHistory.find(2 as RelativeTime)).toEqual({ value: 'foo' })
      expect(contextHistory.find(7 as RelativeTime)).toEqual({ value: 'bar' })
      expect(contextHistory.find(10 as RelativeTime)).toEqual({ value: 'qux' })
    })

    it('should return undefined when no context corresponding to startClocks', () => {
      contextHistory.setCurrent({ value: 'foo' }, 0 as RelativeTime)
      contextHistory.closeCurrent(10 as RelativeTime)
      contextHistory.setCurrent({ value: 'bar' }, 20 as RelativeTime)

      expect(contextHistory.find(15 as RelativeTime)).toBeUndefined()
    })
  })

  it('should reset contexts', () => {
    contextHistory.setCurrent({ value: 'foo' }, 0 as RelativeTime)
    contextHistory.closeCurrent(10 as RelativeTime)
    contextHistory.setCurrent({ value: 'bar' }, 10 as RelativeTime)

    contextHistory.reset()

    expect(contextHistory.getCurrent()).toBeUndefined()
    expect(contextHistory.find(0 as RelativeTime)).toBeUndefined()
  })

  it('should clear old contexts', () => {
    const originalTime = performance.now() as RelativeTime
    contextHistory.setCurrent({ value: 'foo' }, originalTime)
    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    contextHistory.closeCurrent((originalTime + 10) as RelativeTime)
    clock.tick(10)

    expect(contextHistory.find(originalTime)).toBeDefined()

    clock.tick(EXPIRE_DELAY + CLEAR_OLD_CONTEXTS_INTERVAL)

    expect(contextHistory.find(originalTime)).toBeUndefined()
  })
})
