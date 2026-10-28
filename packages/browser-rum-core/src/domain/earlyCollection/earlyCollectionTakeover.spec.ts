import type { RelativeTime, TimeStamp } from '@datadog/js-core/time'
import { relativeToClocks } from '@datadog/js-core/time'
import { globalObject, noop, Observable } from '@datadog/js-core/util'
import {
  EARLY_COLLECTION_GLOBAL_NAME,
  EarlyCollectionEntryType,
  ErrorHandling,
  ErrorSource,
  NO_ERROR_STACK_PRESENT_MESSAGE,
  trackRuntimeError,
} from '@datadog/browser-core'
import type { RawError } from '@datadog/browser-core'
import { registerCleanupTask, replaceMockable, replaceMockableWithSpy } from '@datadog/browser-core/test'
import type { RawRumErrorEvent, RawRumEvent, RawRumEventCollectedData } from '../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { doStartErrorCollection } from '../error/errorCollection'
import {
  stopEarlyCollectionProfiler,
  takeEarlyCollectionProfiler,
  takeOverEarlyCollection,
} from './earlyCollectionTakeover'

describe('takeOverEarlyCollection', () => {
  let lifeCycle: LifeCycle
  let collectedErrors: RawError[]

  function setupLifeCycle() {
    lifeCycle = new LifeCycle()
    collectedErrors = []
    lifeCycle.subscribe(LifeCycleEventType.RAW_ERROR_COLLECTED, ({ error }) => collectedErrors.push(error))
  }

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

  function setEarlyCollection(
    overrides: Partial<{
      buffer: Array<[number, RelativeTime, unknown]>
      profiler: unknown
      version: number
      stop: () => void
    }> = {},
    trackRuntimeErrorReplacement: () => Observable<RawError> = () => new Observable<RawError>()
  ) {
    const earlyCollection = {
      version: 1,
      startClocks: { relative: 1 as RelativeTime, timeStamp: 2 as TimeStamp },
      buffer: [] as Array<[number, RelativeTime, unknown]>,
      profiler: undefined,
      stop: jasmine.createSpy('stop'),
      ...overrides,
    }
    ;(globalObject as unknown as Record<string, unknown>)[EARLY_COLLECTION_GLOBAL_NAME] = earlyCollection
    registerCleanupTask(() => {
      delete (globalObject as unknown as Record<string, unknown>)[EARLY_COLLECTION_GLOBAL_NAME]
    })
    takeEarlyCollectionProfiler() // clear any profiler takeover left by a previous test
    // The takeover installs the error instrumentation: neutralize it.
    replaceMockable(trackRuntimeError, trackRuntimeErrorReplacement)
    return earlyCollection
  }

  function setEarlyCollectionWithMockProfiler() {
    const profiler = createMockProfiler()
    setEarlyCollection({ profiler })
    return profiler
  }

  beforeEach(() => {
    setupLifeCycle()
  })

  it('is a no-op when the early collection is not present', () => {
    const trackRuntimeErrorSpy = replaceMockableWithSpy(trackRuntimeError)

    takeOverEarlyCollection(lifeCycle)

    expect(trackRuntimeErrorSpy).not.toHaveBeenCalled()
    expect(collectedErrors).toEqual([])
  })

  it('installs the SDK error instrumentation so it takes over from the early listeners', () => {
    const runtimeErrorObservable = new Observable<RawError>()
    setEarlyCollection({}, () => runtimeErrorObservable)

    takeOverEarlyCollection(lifeCycle)

    runtimeErrorObservable.notify({
      message: 'post-takeover error',
      source: 'source',
      startClocks: relativeToClocks(4567 as RelativeTime),
    })

    expect(collectedErrors.length).toBe(1)
    expect(collectedErrors[0].message).toBe('post-takeover error')
  })

  it('processes buffered raw errors and replays them in the error pipeline', () => {
    const rawError = new Error('early error')
    rawError.stack = 'Error: early error\n    at foo (http://path/to/file.js:52:15)'
    setEarlyCollection({
      buffer: [
        [EarlyCollectionEntryType.RUNTIME_ERROR, 1234 as RelativeTime, rawError],
        [EarlyCollectionEntryType.RUNTIME_ERROR, 42 as RelativeTime, 'non-error reason'],
      ],
    })

    takeOverEarlyCollection(lifeCycle)

    expect(collectedErrors.length).toBe(2)

    // The first entry is processed with the standard error pipeline: stack
    // parsing happens now, at takeover time, not in the early snippet.
    expect(collectedErrors[0].message).toBe('early error')
    expect(collectedErrors[0].stack).toBe('Error: early error\n  at foo @ http://path/to/file.js:52:15')
    expect(collectedErrors[0].startClocks.relative).toBe(1234 as RelativeTime)
    expect(collectedErrors[0].originalError).toBe(rawError)

    expect(collectedErrors[1].message).toBe('Uncaught "non-error reason"')
  })

  it('ignores buffered entries with an unknown type or malformed shape', () => {
    setEarlyCollection({
      buffer: [
        null as unknown as [number, RelativeTime, unknown],
        [1, 1234 as RelativeTime, 'unknown entry type'],
        [EarlyCollectionEntryType.RUNTIME_ERROR, 'not a timestamp' as unknown as RelativeTime, new Error('bad clocks')],
        [EarlyCollectionEntryType.RUNTIME_ERROR, 1235 as RelativeTime, new Error('early error')],
      ],
    })

    takeOverEarlyCollection(lifeCycle)

    expect(collectedErrors.length).toBe(1)
    expect(collectedErrors[0].message).toBe('early error')
  })

  it('seals the early collection and deletes its global so it cannot be adopted twice', () => {
    const earlyCollection = setEarlyCollection()

    takeOverEarlyCollection(lifeCycle)
    takeOverEarlyCollection(lifeCycle)

    expect(earlyCollection.stop).toHaveBeenCalledTimes(1)
    expect((globalObject as unknown as Record<string, unknown>)[EARLY_COLLECTION_GLOBAL_NAME]).toBeUndefined()
    expect(collectedErrors).toEqual([])
  })

  it('claims the early Profiler instance for the profiler chunk to adopt', () => {
    const profiler = setEarlyCollectionWithMockProfiler()

    takeOverEarlyCollection(lifeCycle)

    expect(takeEarlyCollectionProfiler()).toEqual({
      profiler,
      startClocks: { relative: 1 as RelativeTime, timeStamp: 2 as TimeStamp },
    })
    // The Profiler can be adopted only once.
    expect(takeEarlyCollectionProfiler()).toBeUndefined()
  })

  it('does not claim an invalid early Profiler instance', () => {
    const profiler = createMockProfiler()
    profiler.stopped = true
    setEarlyCollection({ profiler })

    takeOverEarlyCollection(lifeCycle)

    expect(takeEarlyCollectionProfiler()).toBeUndefined()
  })

  describe('integration with the error pipeline', () => {
    let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>>

    beforeEach(() => {
      lifeCycle = new LifeCycle()
      rawRumEvents = []
      lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (event) => rawRumEvents.push(event))
      // Wire the error pipeline like the RUM start does.
      doStartErrorCollection(lifeCycle)
    })

    it('replays buffered raw errors as RUM error events', () => {
      const earlyError = new Error('early error')
      earlyError.stack = 'Error: early error\n    at foo (http://path/to/file.js:52:15)'
      const earlyCollection = setEarlyCollection({
        buffer: [
          [EarlyCollectionEntryType.RUNTIME_ERROR, 1234 as RelativeTime, earlyError],
          [EarlyCollectionEntryType.RUNTIME_ERROR, 42 as RelativeTime, 'early rejection reason'],
        ],
      })

      takeOverEarlyCollection(lifeCycle)

      expect(rawRumEvents.length).toBe(2)

      // The `relative` time is the buffered entry timestamp, converted as-is. The
      // `timeStamp` is derived from it (see `relativeToClocks`) and can drift by
      // a millisecond between two computations, so it is not compared exactly.
      expect(rawRumEvents[0].startClocks.relative).toBe(1234)
      const firstEvent = rawRumEvents[0].rawRumEvent as RawRumErrorEvent
      expect(firstEvent.error).toEqual(
        jasmine.objectContaining({
          message: 'early error',
          source: ErrorSource.SOURCE,
          handling: ErrorHandling.UNHANDLED,
          stack: 'Error: early error\n  at foo @ http://path/to/file.js:52:15',
        })
      )

      const secondEvent = rawRumEvents[1].rawRumEvent as RawRumErrorEvent
      expect(secondEvent.error).toEqual(
        jasmine.objectContaining({
          message: 'Uncaught "early rejection reason"',
          source: ErrorSource.SOURCE,
          handling: ErrorHandling.UNHANDLED,
          stack: NO_ERROR_STACK_PRESENT_MESSAGE,
        })
      )

      expect(earlyCollection.stop).toHaveBeenCalledTimes(1)
      expect((globalObject as unknown as Record<string, unknown>)[EARLY_COLLECTION_GLOBAL_NAME]).toBeUndefined()
    })
  })

  describe('stopEarlyCollectionProfiler', () => {
    it('stops and discards the claimed Profiler', () => {
      const profiler = setEarlyCollectionWithMockProfiler()
      takeOverEarlyCollection(lifeCycle)

      stopEarlyCollectionProfiler()

      expect(profiler.stopCalls).toBe(1)
      expect(profiler.stopped).toBe(true)
      expect(takeEarlyCollectionProfiler()).toBeUndefined()
    })

    it('is a no-op when nothing was claimed', () => {
      expect(() => stopEarlyCollectionProfiler()).not.toThrow()
    })
  })
})
