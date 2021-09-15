import { ClocksState, relativeToClocks, RelativeTime, ONE_MINUTE } from '@datadog/browser-core'
import { mockClock, Clock } from '../../../core/test/specHelper'
import { CLEAR_OLD_CONTEXTS_INTERVAL, ContextHistory } from './contextHistory'

const EXPIRE_DELAY = 10 * ONE_MINUTE

describe('contextHistory', () => {
  let contextHistory: ContextHistory<{ startClocks: ClocksState; value: string }, { value: string }>
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    contextHistory = new ContextHistory((raw) => ({ value: raw.value }), EXPIRE_DELAY)
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
      contextHistory.current = {
        startClocks: relativeToClocks(0 as RelativeTime),
        value: 'foo',
      }

      expect(contextHistory.find()).toEqual({ value: 'foo' })
    })

    it('should return the context corresponding to startClocks', () => {
      contextHistory.current = {
        startClocks: relativeToClocks(0 as RelativeTime),
        value: 'foo',
      }
      contextHistory.closeCurrent(relativeToClocks(5 as RelativeTime))
      contextHistory.current = {
        startClocks: relativeToClocks(5 as RelativeTime),
        value: 'bar',
      }
      contextHistory.closeCurrent(relativeToClocks(10 as RelativeTime))
      contextHistory.current = {
        startClocks: relativeToClocks(10 as RelativeTime),
        value: 'qux',
      }

      expect(contextHistory.find(relativeToClocks(2 as RelativeTime))).toEqual({ value: 'foo' })
      expect(contextHistory.find(relativeToClocks(7 as RelativeTime))).toEqual({ value: 'bar' })
      expect(contextHistory.find(relativeToClocks(10 as RelativeTime))).toEqual({ value: 'qux' })
    })

    it('should return undefined when no context corresponding to startClocks', () => {
      contextHistory.current = {
        startClocks: relativeToClocks(0 as RelativeTime),
        value: 'foo',
      }
      contextHistory.closeCurrent(relativeToClocks(10 as RelativeTime))
      contextHistory.current = {
        startClocks: relativeToClocks(20 as RelativeTime),
        value: 'bar',
      }

      expect(contextHistory.find(relativeToClocks(15 as RelativeTime))).toBeUndefined()
    })
  })

  describe('closeCurrent', () => {
    it('should not clean current state to allow to use it for next current', () => {
      contextHistory.current = {
        startClocks: relativeToClocks(0 as RelativeTime),
        value: 'foo',
      }
      contextHistory.closeCurrent(relativeToClocks(5 as RelativeTime))

      expect(contextHistory.current).toBeDefined()
    })
  })

  it('should reset contexts', () => {
    contextHistory.current = {
      startClocks: relativeToClocks(0 as RelativeTime),
      value: 'foo',
    }
    contextHistory.closeCurrent(relativeToClocks(10 as RelativeTime))
    contextHistory.current = {
      startClocks: relativeToClocks(10 as RelativeTime),
      value: 'bar',
    }

    contextHistory.reset()

    expect(contextHistory.current).toBeUndefined()
    expect(contextHistory.find(relativeToClocks(0 as RelativeTime))).toBeUndefined()
  })

  it('should clear old contexts', () => {
    const originalTime = performance.now()
    contextHistory.current = {
      startClocks: relativeToClocks(originalTime as RelativeTime),
      value: 'foo',
    }
    contextHistory.closeCurrent(relativeToClocks((originalTime + 10) as RelativeTime))
    contextHistory.current = undefined
    clock.tick(10)

    expect(contextHistory.find(relativeToClocks(originalTime as RelativeTime))).toBeDefined()

    clock.tick(EXPIRE_DELAY + CLEAR_OLD_CONTEXTS_INTERVAL)

    expect(contextHistory.find(relativeToClocks(originalTime as RelativeTime))).toBeUndefined()
  })
})
