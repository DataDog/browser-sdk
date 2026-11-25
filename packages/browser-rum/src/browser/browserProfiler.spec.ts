import { clocksNow } from '@datadog/js-core/time'
import { globalObject } from '@datadog/js-core/util'
import type { Profiler, ProfilerInitOptions, ProfilerTrace } from '@datadog/js-core/util'
import { display } from '@datadog/browser-core'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { createBrowserProfiler, EARLY_COLLECTION_GLOBAL_NAME, stopEarlyCollectionProfiler } from './browserProfiler'

describe('browser profiler', () => {
  const configuration = { sampleIntervalMs: 10, collectIntervalMs: 60000 }
  const trace: ProfilerTrace = { resources: [], frames: [], stacks: [], samples: [] }
  let constructorSpy: jasmine.Spy
  let stopSpy: jasmine.Spy<() => Promise<ProfilerTrace>>
  let nativeProfilers: Profiler[]
  let warnSpy: jasmine.Spy

  beforeEach(() => {
    warnSpy = spyOn(display, 'warn')
    const originalProfiler = globalObject.Profiler
    registerCleanupTask(() => {
      globalObject.Profiler = originalProfiler
      delete (globalObject as unknown as Record<string, unknown>)[EARLY_COLLECTION_GLOBAL_NAME]
    })

    constructorSpy = jasmine.createSpy('Profiler')
    stopSpy = jasmine.createSpy('stop').and.returnValue(Promise.resolve(trace))
    nativeProfilers = []
    globalObject.Profiler = class extends EventTarget {
      readonly sampleInterval: number
      stopped = false

      constructor(options: ProfilerInitOptions) {
        super()
        constructorSpy(options)
        this.sampleInterval = options.sampleInterval
        nativeProfilers.push(this)
      }

      stop(): Promise<ProfilerTrace> {
        this.stopped = true
        return stopSpy()
      }
    }
  })

  it('sizes the native buffer from the sample and collection intervals', () => {
    const result = createBrowserProfiler(configuration)

    expect(result.status).toBe('success')
    expect(constructorSpy).toHaveBeenCalledWith({ sampleInterval: 10, maxBufferSize: 9000 })
  })

  it('notifies the caller when the native buffer fills', () => {
    const onBufferFull = jasmine.createSpy('onBufferFull')
    const result = createBrowserProfiler(configuration)
    if (result.status !== 'success') {
      fail('Expected profiler creation to succeed')
      return
    }
    result.profiler.sampleBufferFullObservable.subscribe(onBufferFull)

    nativeProfilers[0].dispatchEvent(new Event('samplebufferfull'))

    expect(onBufferFull).toHaveBeenCalledTimes(1)
  })

  it('removes the buffer listener and returns the trace when stopped', async () => {
    const onBufferFull = jasmine.createSpy('onBufferFull')
    const result = createBrowserProfiler(configuration)
    if (result.status !== 'success') {
      fail('Expected profiler creation to succeed')
      return
    }

    result.profiler.sampleBufferFullObservable.subscribe(onBufferFull)

    expect(await result.profiler.stop()).toBe(trace)
    nativeProfilers[0].dispatchEvent(new Event('samplebufferfull'))

    expect(stopSpy).toHaveBeenCalledTimes(1)
    expect(onBufferFull).not.toHaveBeenCalled()
  })

  it('propagates trace collection failures to the caller', async () => {
    const result = createBrowserProfiler(configuration)
    if (result.status !== 'success') {
      fail('Expected profiler creation to succeed')
      return
    }
    const error = new Error('Trace collection failed')
    stopSpy.and.callFake(() => Promise.reject(error))

    await expectAsync(result.profiler.stop()).toBeRejectedWith(error)
  })

  it('reports when the browser does not support profiling', () => {
    globalObject.Profiler = undefined

    expect(createBrowserProfiler(configuration)).toEqual({
      status: 'error',
      reason: 'not-supported-by-browser',
    })
  })

  it('identifies a missing document policy', () => {
    const error = new Error('JS profiling is disabled by Document Policy')
    constructorSpy.and.throwError(error)

    expect(createBrowserProfiler(configuration)).toEqual({
      status: 'error',
      reason: 'missing-document-policy-header',
    })
    expect(warnSpy).toHaveBeenCalledWith(
      '[DD_RUM] Profiler startup failed. Ensure your server includes the `Document-Policy: js-profiling` response header when serving HTML pages.',
      error
    )
  })

  it('reports unexpected construction errors', () => {
    const error = new Error('Unexpected construction failure')
    constructorSpy.and.throwError(error)

    expect(createBrowserProfiler(configuration)).toEqual({
      status: 'error',
      reason: 'unexpected-exception',
    })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('records when a new profiler starts without marking it as early collection', () => {
    mockClock()
    const startClocks = clocksNow()

    const result = createBrowserProfiler(configuration)
    if (result.status !== 'success') {
      fail('Expected profiler creation to succeed')
      return
    }

    expect(result.profiler.startClocks).toEqual(startClocks)
    expect(result.profiler.collectionType).toBeUndefined()
  })

  function publishEarlyProfiler(version = 1) {
    const ProfilerConstructor = globalObject.Profiler
    if (!ProfilerConstructor) {
      throw new Error('Expected the mock Profiler constructor')
    }
    const earlyCollection = {
      version,
      startClocks: clocksNow(),
      profiler: new ProfilerConstructor({ sampleInterval: 10, maxBufferSize: 9000 }),
    }
    Object.assign(globalObject, { [EARLY_COLLECTION_GLOBAL_NAME]: earlyCollection })
    return earlyCollection
  }

  function readEarlyCollection() {
    return (globalObject as unknown as Record<string, unknown>)[EARLY_COLLECTION_GLOBAL_NAME]
  }

  describe('early collection', () => {
    it('adopts the early profiler and preserves its original start time', () => {
      const clock = mockClock()
      const { startClocks } = publishEarlyProfiler()
      clock.tick(1000)

      const result = createBrowserProfiler(configuration)
      if (result.status !== 'success') {
        fail('Expected profiler creation to succeed')
        return
      }

      expect(constructorSpy).toHaveBeenCalledTimes(1)
      expect(result.profiler.startClocks).toBe(startClocks)
      expect(result.profiler.collectionType).toBe('early')
    })

    it('consumes the early profiler once and preserves other fields on the global', () => {
      const earlyCollection = publishEarlyProfiler()
      const bufferedEvents: unknown[] = []
      Object.assign(earlyCollection, { bufferedEvents })

      const first = createBrowserProfiler(configuration)
      const second = createBrowserProfiler(configuration)
      if (first.status !== 'success' || second.status !== 'success') {
        fail('Expected profiler creation to succeed')
        return
      }

      expect(first.profiler.collectionType).toBe('early')
      expect(second.profiler.collectionType).toBeUndefined()
      expect(constructorSpy).toHaveBeenCalledTimes(2)
      expect(readEarlyCollection()).toEqual({ version: 1, startClocks: earlyCollection.startClocks, bufferedEvents })
    })

    it('attaches and removes the buffer listener on the adopted profiler', async () => {
      const { profiler: earlyProfiler } = publishEarlyProfiler()
      const onBufferFull = jasmine.createSpy('onBufferFull')
      const result = createBrowserProfiler(configuration)
      if (result.status !== 'success') {
        fail('Expected profiler creation to succeed')
        return
      }

      result.profiler.sampleBufferFullObservable.subscribe(onBufferFull)
      earlyProfiler.dispatchEvent(new Event('samplebufferfull'))
      expect(onBufferFull).toHaveBeenCalledTimes(1)

      expect(await result.profiler.stop()).toBe(trace)
      expect(earlyProfiler.stopped).toBe(true)
      earlyProfiler.dispatchEvent(new Event('samplebufferfull'))
      expect(onBufferFull).toHaveBeenCalledTimes(1)
    })

    it('leaves an unknown contract untouched and starts a new profiler', () => {
      const earlyCollection = publishEarlyProfiler(2)
      const original = { ...earlyCollection }

      stopEarlyCollectionProfiler()
      const result = createBrowserProfiler(configuration)
      if (result.status !== 'success') {
        fail('Expected profiler creation to succeed')
        return
      }

      expect(result.profiler.collectionType).toBeUndefined()
      expect(constructorSpy).toHaveBeenCalledTimes(2)
      expect(stopSpy).not.toHaveBeenCalled()
      expect(readEarlyCollection()).toEqual(original)
    })

    it('starts a new profiler when the early profiler is already stopped', async () => {
      const { profiler: earlyProfiler } = publishEarlyProfiler()
      await earlyProfiler.stop()

      const result = createBrowserProfiler(configuration)
      if (result.status !== 'success') {
        fail('Expected profiler creation to succeed')
        return
      }

      expect(result.profiler.collectionType).toBeUndefined()
      expect(constructorSpy).toHaveBeenCalledTimes(2)
    })

    it('ignores a malformed early collection global', () => {
      Object.assign(globalObject, { [EARLY_COLLECTION_GLOBAL_NAME]: null })

      const result = createBrowserProfiler(configuration)

      expect(result.status).toBe('success')
      expect(constructorSpy).toHaveBeenCalledTimes(1)
      expect(readEarlyCollection()).toBeNull()
    })

    it('can adopt an existing profiler when its constructor is no longer available', () => {
      publishEarlyProfiler()
      globalObject.Profiler = undefined

      const result = createBrowserProfiler(configuration)

      expect(result.status).toBe('success')
      expect(constructorSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('stopEarlyCollectionProfiler', () => {
    it('discards an unclaimed early profiler once, preserving the rest of the global', () => {
      const { profiler: earlyProfiler, startClocks } = publishEarlyProfiler()

      stopEarlyCollectionProfiler()
      stopEarlyCollectionProfiler()

      expect(earlyProfiler.stopped).toBe(true)
      expect(stopSpy).toHaveBeenCalledTimes(1)
      expect(readEarlyCollection()).toEqual({ version: 1, startClocks })
    })

    it('does nothing when early collection did not run', () => {
      expect(() => stopEarlyCollectionProfiler()).not.toThrow()
      expect(stopSpy).not.toHaveBeenCalled()
    })

    it('leaves cleanup to the owner after the early profiler has been adopted', async () => {
      const { profiler: earlyProfiler } = publishEarlyProfiler()
      const result = createBrowserProfiler(configuration)
      if (result.status !== 'success') {
        fail('Expected profiler creation to succeed')
        return
      }

      stopEarlyCollectionProfiler()

      expect(earlyProfiler.stopped).toBe(false)
      expect(stopSpy).not.toHaveBeenCalled()

      await result.profiler.stop()
      expect(earlyProfiler.stopped).toBe(true)
      expect(stopSpy).toHaveBeenCalledTimes(1)
    })
  })
})
