import { describe, expect, it } from 'vitest'
import type { ProfilerInitOptions } from '@datadog/js-core/util'
import { registerCleanupTask } from '@datadog/browser-core/test'
import type { EarlyCollectionGlobalV1 } from './index'
import { startEarlyCollection } from './index'

describe('early collection', () => {
  function startAndCleanup(): EarlyCollectionGlobalV1 {
    startEarlyCollection()
    const earlyCollection = readEarlyCollection()
    if (!earlyCollection) {
      throw new Error('the early collection global was not published')
    }
    registerCleanupTask(() => {
      delete (window as { _DD_EARLY_COLLECTION?: unknown })._DD_EARLY_COLLECTION
    })
    return earlyCollection
  }

  function readEarlyCollection(): EarlyCollectionGlobalV1 | undefined {
    return (window as { _DD_EARLY_COLLECTION?: EarlyCollectionGlobalV1 })._DD_EARLY_COLLECTION
  }

  /** Local Profiler mock: the package must stay standalone, so it cannot rely on other packages' test utils. */
  function mockProfilerConstructor(options: { throws?: boolean } = {}) {
    class MockProfiler {
      static instances: MockProfiler[] = []
      readonly sampleInterval: number
      readonly initOptions: ProfilerInitOptions
      stopped = false

      constructor(initOptions: ProfilerInitOptions) {
        if (options.throws) {
          throw new Error('disabled by Document Policy')
        }
        MockProfiler.instances.push(this)
        this.sampleInterval = initOptions.sampleInterval
        this.initOptions = initOptions
      }

      stop(): Promise<unknown> {
        this.stopped = true
        return Promise.resolve({})
      }
    }

    const originalProfiler = (window as { Profiler?: unknown }).Profiler
    ;(window as { Profiler?: unknown }).Profiler = MockProfiler
    registerCleanupTask(() => {
      ;(window as { Profiler?: unknown }).Profiler = originalProfiler
    })
    return MockProfiler
  }

  it('publishes the handoff global with contract version 1', () => {
    const earlyCollection = startAndCleanup()

    expect(earlyCollection.version).toBe(1)
    expect(typeof earlyCollection.startClocks.relative).toBe('number')
    expect(typeof earlyCollection.startClocks.timeStamp).toBe('number')
  })

  it('starts a Profiler with the SDK tuning and publishes it', () => {
    const ProfilerConstructor = mockProfilerConstructor()
    const earlyCollection = startAndCleanup()

    const profiler = earlyCollection.profiler as InstanceType<typeof ProfilerConstructor>
    expect(profiler).toBeInstanceOf(ProfilerConstructor)
    expect(profiler.initOptions).toEqual({ sampleInterval: 10, maxBufferSize: 9000 })
    expect(profiler.stopped).toBe(false)
  })

  it('keeps the first session when the script is evaluated twice', () => {
    const ProfilerConstructor = mockProfilerConstructor()
    const first = startAndCleanup()
    const firstProfiler = first.profiler
    const firstClocks = first.startClocks

    // A shared layout plus a page template, or a tag manager, can evaluate
    // the script twice: the earliest session wins, the global is not
    // overwritten (which would orphan the first running Profiler instance).
    startEarlyCollection()

    const second = readEarlyCollection()
    expect(second).toBe(first)
    expect(second?.profiler).toBe(firstProfiler)
    expect(second?.startClocks).toBe(firstClocks)
    // Only the first evaluation instantiated a Profiler: no second instance
    // was created (it would keep sampling until its buffer fills, with no
    // reference left to stop it).
    expect(ProfilerConstructor.instances.length).toBe(1)
  })

  it('fails silently when the Profiler API is not available', () => {
    mockProfilerConstructor({ throws: true })
    const earlyCollection = startAndCleanup()

    expect(earlyCollection.profiler).toBeUndefined()
  })
})
