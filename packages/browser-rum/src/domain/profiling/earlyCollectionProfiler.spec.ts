import type { RelativeTime, TimeStamp } from '@datadog/js-core/time'
import { globalObject, noop } from '@datadog/js-core/util'
import { registerCleanupTask } from '@datadog/browser-core/test'
import {
  EARLY_COLLECTION_GLOBAL_NAME,
  stopEarlyCollectionProfiler,
  takeEarlyCollectionProfiler,
} from './earlyCollectionProfiler'

describe('earlyCollectionProfiler', () => {
  interface MockProfilerInstance {
    sampleInterval: number
    stopped: boolean
    stopCalls: number
    stop: () => Promise<unknown>
    addEventListener: () => void
    removeEventListener: () => void
    dispatchEvent: () => boolean
  }

  function createMockProfiler(): MockProfilerInstance {
    const profiler = {
      sampleInterval: 10,
      stopped: false,
      stopCalls: 0,
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: () => true,
      stop: () => {
        profiler.stopCalls += 1
        profiler.stopped = true
        return Promise.resolve({})
      },
    }
    return profiler
  }

  function setEarlyCollection(overrides: Partial<{ version: unknown; profiler: MockProfilerInstance }> = {}) {
    const earlyCollection = {
      version: 1,
      startClocks: { relative: 1 as RelativeTime, timeStamp: 2 as TimeStamp },
      profiler: createMockProfiler(),
      ...overrides,
    }
    ;(globalObject as unknown as Record<string, unknown>)[EARLY_COLLECTION_GLOBAL_NAME] = earlyCollection
    registerCleanupTask(() => {
      delete (globalObject as unknown as Record<string, unknown>)[EARLY_COLLECTION_GLOBAL_NAME]
    })
    return earlyCollection
  }

  function readEarlyCollection() {
    return (globalObject as unknown as Record<string, unknown>)[EARLY_COLLECTION_GLOBAL_NAME]
  }

  it('takes the early Profiler instance, with the time it started, and deletes the global', () => {
    const earlyCollection = setEarlyCollection()

    const earlyProfiler = takeEarlyCollectionProfiler()

    expect(earlyProfiler).toEqual({
      profiler: earlyCollection.profiler,
      startClocks: { relative: 1 as RelativeTime, timeStamp: 2 as TimeStamp },
    })
    expect(readEarlyCollection()).toBeUndefined()
    // The instance can be taken only once.
    expect(takeEarlyCollectionProfiler()).toBeUndefined()
  })

  it('returns undefined when the early collection package did not run', () => {
    expect(takeEarlyCollectionProfiler()).toBeUndefined()
  })

  it('returns undefined and leaves the global untouched when the contract version is not recognized', () => {
    const earlyCollection = setEarlyCollection({ version: 2 })

    expect(takeEarlyCollectionProfiler()).toBeUndefined()
    expect(readEarlyCollection()).toBe(earlyCollection)
  })

  it('returns undefined when the early Profiler instance is already stopped', async () => {
    const profiler = createMockProfiler()
    await profiler.stop()
    setEarlyCollection({ profiler })

    expect(takeEarlyCollectionProfiler()).toBeUndefined()
  })

  describe('stopEarlyCollectionProfiler', () => {
    it('stops the early Profiler instance and discards its samples', async () => {
      const earlyCollection = setEarlyCollection()

      stopEarlyCollectionProfiler()
      await Promise.resolve()

      expect(earlyCollection.profiler.stopCalls).toBe(1)
      expect(readEarlyCollection()).toBeUndefined()
    })

    it('is a no-op when the early collection package did not run', () => {
      expect(() => stopEarlyCollectionProfiler()).not.toThrow()
    })
  })
})
