import { deepClone, globalObject } from '@datadog/js-core/util'
import type { Profiler, ProfilerConstructor, ProfilerInitOptions } from '@datadog/js-core/util'
import { clocksNow } from '@datadog/js-core/time'
import { createNewEvent, registerCleanupTask, restorePageVisibility, setPageVisibility } from '@datadog/browser-core/test'
import { mockProfiler } from '../../../test'
import { EARLY_PROFILER_GLOBAL_NAME, startEarlyProfiler } from './earlyProfiler'
import { mockedTrace } from './test-utils/mockedTrace'
import type { EarlyProfiler, EarlyProfilerStart, EarlyProfilerTakeover } from './types'

interface MockProfilerInstance extends Profiler {
  readonly initOptions: ProfilerInitOptions
  triggerSampleBufferFull: () => void
  stopped: boolean
}

describe('earlyProfiler', () => {
  let instances: Set<unknown>

  function setEarlyProfilerSnippet(profiler: unknown, startClocks: unknown) {
    ;(globalObject as unknown as { [key: string]: unknown })[EARLY_PROFILER_GLOBAL_NAME] = { profiler, startClocks }
  }

  function getEarlyProfilerSnippet() {
    return (globalObject as unknown as { [key: string]: unknown })[EARLY_PROFILER_GLOBAL_NAME]
  }

  function deleteEarlyProfilerSnippet() {
    delete (globalObject as unknown as { [key: string]: unknown })[EARLY_PROFILER_GLOBAL_NAME]
  }

  function createMockProfilerInstance() {
    const ProfilerConstructor = globalObject.Profiler as ProfilerConstructor
    return new ProfilerConstructor({ sampleInterval: 10, maxBufferSize: 9000 }) as unknown as MockProfilerInstance
  }
  function mockInstances(): MockProfilerInstance[] {
    return [...instances] as MockProfilerInstance[]
  }

  /** Mocks the `Profiler` global with a constructor that always throws. */
  function mockFailingProfiler(constructorError: Error) {
    const originalProfiler = globalObject.Profiler
    globalObject.Profiler = class {
      constructor() {
        throw constructorError
      }
    } as unknown as ProfilerConstructor
    registerCleanupTask(() => {
      globalObject.Profiler = originalProfiler
    })
  }

  function setVisibility(state: 'visible' | 'hidden') {
    setPageVisibility(state)
    window.dispatchEvent(createNewEvent('visibilitychange'))
  }

  function getEarlyProfiler(start: EarlyProfilerStart): EarlyProfiler {
    if (start.state !== 'started') {
      throw new Error('expected the early collection to be started')
    }
    return start.earlyProfiler
  }

  beforeEach(() => {
    instances = mockProfiler(deepClone(mockedTrace)).instances
    registerCleanupTask(deleteEarlyProfilerSnippet)
  })

  afterEach(() => {
    restorePageVisibility()
  })

  describe('snippet adoption', () => {
    it('adopts the Profiler instance started by the snippet instead of creating a new one', () => {
      const snippetProfiler = createMockProfilerInstance()
      const snippetStartClocks = clocksNow()
      setEarlyProfilerSnippet(snippetProfiler, snippetStartClocks)

      const takeover = getEarlyProfiler(startEarlyProfiler()).takeover()

      expect(instances.size).toBe(1)
      expect(takeover?.profiler).toBe(snippetProfiler)
      expect(takeover?.startClocks).toBe(snippetStartClocks)
    })

    it('deletes the snippet global so the instance is not adopted twice', () => {
      setEarlyProfilerSnippet(createMockProfilerInstance(), clocksNow())

      getEarlyProfiler(startEarlyProfiler()).stop()

      expect(getEarlyProfilerSnippet()).toBeUndefined()
    })

    it('creates its own instance when the snippet did not run or failed', () => {
      // The snippet leaves the global undefined when the Profiler API is not
      // available or the `Document-Policy: js-profiling` header is missing.
      const takeover = getEarlyProfiler(startEarlyProfiler()).takeover()

      expect(instances.size).toBe(1)
      expect(takeover?.profiler).toBe(mockInstances()[0])
    })

    it('creates its own instance when the snippet Profiler instance was already stopped', () => {
      const snippetProfiler = createMockProfilerInstance()
      snippetProfiler.stopped = true
      setEarlyProfilerSnippet(snippetProfiler, clocksNow())

      const takeover = getEarlyProfiler(startEarlyProfiler()).takeover()

      expect(takeover?.profiler).not.toBe(snippetProfiler)
    })

    it('creates its own instance when the snippet global shape is invalid', () => {
      const snippetProfiler = createMockProfilerInstance()
      setEarlyProfilerSnippet(snippetProfiler, 'not clocks')

      const takeover = getEarlyProfiler(startEarlyProfiler()).takeover()

      expect(takeover?.profiler).not.toBe(snippetProfiler)
    })
  })

  describe('collection', () => {
    it('starts a Profiler instance with the default configuration', () => {
      const earlyProfiler = getEarlyProfiler(startEarlyProfiler())

      expect(instances.size).toBe(1)
      expect(mockInstances()[0].initOptions).toEqual({
        sampleInterval: 10,
        maxBufferSize: 9000,
      })
      earlyProfiler.stop()
    })

    it('returns a not-supported error when the Profiler API is not available', () => {
      const originalProfiler = globalObject.Profiler
      globalObject.Profiler = undefined
      registerCleanupTask(() => {
        globalObject.Profiler = originalProfiler
      })

      const start = startEarlyProfiler()

      expect(start).toEqual({ state: 'error', errorReason: 'not-supported-by-browser' })
    })

    it('returns a document-policy error when the Profiler construction is disabled by Document Policy', () => {
      mockFailingProfiler(new Error('Profiler disabled by Document Policy'))

      const start = startEarlyProfiler()

      expect(start).toEqual({ state: 'error', errorReason: 'missing-document-policy-header' })
    })

    it('returns an unexpected-exception error when the Profiler construction throws', () => {
      mockFailingProfiler(new Error('boom'))

      const start = startEarlyProfiler()

      expect(start).toEqual({ state: 'error', errorReason: 'unexpected-exception' })
    })

    it('restarts a new Profiler instance when the sample buffer is full', () => {
      const earlyProfiler = getEarlyProfiler(startEarlyProfiler())
      const [firstInstance] = mockInstances()

      firstInstance.triggerSampleBufferFull()

      expect(instances.size).toBe(2)
      expect(firstInstance.stopped).toBeTrue()
      const takeover = earlyProfiler.takeover()
      expect(takeover?.profiler).not.toBe(firstInstance)
      expect(instances.size).toBe(2) // takeover does not create a new instance
    })

    it('discards collected samples and pauses when the page becomes hidden', () => {
      const earlyProfiler = getEarlyProfiler(startEarlyProfiler())
      const [firstInstance] = mockInstances()

      setVisibility('hidden')

      expect(firstInstance.stopped).toBeTrue()
      expect(earlyProfiler.takeover()).toBeUndefined()
    })

    it('resumes collection with a new instance when the page becomes visible again', () => {
      const earlyProfiler = getEarlyProfiler(startEarlyProfiler())
      const [firstInstance] = mockInstances()

      setVisibility('hidden')
      setVisibility('visible')

      expect(instances.size).toBe(2)
      const takeover = earlyProfiler.takeover()
      expect(takeover?.profiler).not.toBe(firstInstance)
      expect(takeover?.startClocks).toBeDefined()
    })
  })

  describe('takeover', () => {
    it('hands over the running Profiler instance with its start clocks', () => {
      const snippetProfiler = createMockProfilerInstance()
      const snippetStartClocks = clocksNow()
      setEarlyProfilerSnippet(snippetProfiler, snippetStartClocks)

      const takeover = getEarlyProfiler(startEarlyProfiler()).takeover()

      expect(takeover).toEqual({ profiler: snippetProfiler, startClocks: snippetStartClocks } satisfies EarlyProfilerTakeover)
    })

    it('stops listening to sample buffer full events after takeover', () => {
      const earlyProfiler = getEarlyProfiler(startEarlyProfiler())
      const takeover = earlyProfiler.takeover() as EarlyProfilerTakeover

      ;(takeover.profiler as unknown as MockProfilerInstance).triggerSampleBufferFull()

      expect(instances.size).toBe(1)
    })

    it('returns undefined when called twice', () => {
      const earlyProfiler = getEarlyProfiler(startEarlyProfiler())

      expect(earlyProfiler.takeover()).toBeDefined()
      expect(earlyProfiler.takeover()).toBeUndefined()
    })
  })

  describe('stop', () => {
    it('stops the running Profiler instance and discards its samples', () => {
      const earlyProfiler = getEarlyProfiler(startEarlyProfiler())

      earlyProfiler.stop()

      const [firstInstance] = mockInstances()
      expect(firstInstance.stopped).toBeTrue()
      expect(earlyProfiler.takeover()).toBeUndefined()
    })

    it('does not restart the Profiler on sample buffer full after stop', () => {
      const earlyProfiler = getEarlyProfiler(startEarlyProfiler())
      const [firstInstance] = mockInstances()

      earlyProfiler.stop()
      firstInstance.triggerSampleBufferFull()

      expect(instances.size).toBe(1)
    })
  })
})
