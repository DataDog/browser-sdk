import {
  BridgeCapability,
  createIdentityEncoder,
  EARLY_COLLECTION_GLOBAL_NAME,
  trackRuntimeError,
  type RawError,
} from '@datadog/browser-core'
import { deepClone, globalObject, noop, Observable } from '@datadog/js-core/util'
import {
  MID_HASH_UUID,
  replaceMockableWithSpy,
  createSessionManagerMock,
  replaceMockable,
  waitNextMicrotask,
  mockEventBridge,
  registerCleanupTask,
} from '@datadog/browser-core/test'
import { mockRumConfiguration, mockViewHistory } from '@datadog/browser-rum-core/test'
import { createHooks, LifeCycle, takeEarlyCollectionProfiler, takeOverEarlyCollection } from '@datadog/browser-rum-core'
import { mockProfiler } from '../../test'
import { mockedTrace } from '../domain/profiling/test-utils/mockedTrace'
import { isProfilingSupported } from '../domain/profiling/profilingSupported'
import { makeProfilerApi } from './profilerApi'
import { lazyLoadProfiler } from './lazyLoadProfiler'

describe('profilerApi', () => {
  describe('deterministic sampling', () => {
    it('should apply the correction factor for chained sampling on the profiling sample rate', () => {
      // MID_HASH_UUID has a hash of ~50.7%. With sessionSampleRate=60 and profilingSampleRate=60:
      // - Without correction: isSampled(id, 60) → true (50.7 < 60)
      // - With correction: isSampled(id, 60*60/100=36) → false (50.7 > 36)
      const isProfilingSupportedSpy = replaceMockableWithSpy(isProfilingSupported)
      const profilerApi = makeProfilerApi()

      profilerApi.onRumStart(
        new LifeCycle(),
        createHooks(),
        mockRumConfiguration({ sessionSampleRate: 60, profilingSampleRate: 60 }),
        createSessionManagerMock().setId(MID_HASH_UUID),
        mockViewHistory(),
        createIdentityEncoder
      )

      expect(isProfilingSupportedSpy).not.toHaveBeenCalled()
    })
  })

  describe('bridge mode', () => {
    let createRumProfilerSpy: jasmine.Spy

    beforeEach(() => {
      createRumProfilerSpy = jasmine
        .createSpy('createRumProfiler')
        .and.returnValue({ start: jasmine.createSpy(), stop: jasmine.createSpy() })
      replaceMockable(isProfilingSupported, () => true)
      replaceMockable(lazyLoadProfiler, () => Promise.resolve(createRumProfilerSpy))
    })

    async function startApi() {
      const api = makeProfilerApi()
      api.onRumStart(
        new LifeCycle(),
        createHooks(),
        mockRumConfiguration({ profilingSampleRate: 100 }),
        createSessionManagerMock().setId('session-id-1'),
        mockViewHistory(),
        createIdentityEncoder
      )
      await waitNextMicrotask() // let lazyLoadProfiler().then() run
      return api
    }

    it('without bridge, it starts the profiler', async () => {
      await startApi()
      expect(createRumProfilerSpy).toHaveBeenCalled()
    })

    it('without PROFILES capability, it does not start the profiler', async () => {
      mockEventBridge({ capabilities: [BridgeCapability.RECORDS] })
      await startApi()
      expect(createRumProfilerSpy).not.toHaveBeenCalled()
    })

    it('with PROFILES capability, it starts the profiler', async () => {
      mockEventBridge({ capabilities: [BridgeCapability.RECORDS, BridgeCapability.PROFILES] })
      await startApi()
      expect(createRumProfilerSpy).toHaveBeenCalled()
    })

    it('with PROFILES capability, it starts the profiler even when profilingSampleRate is 0', async () => {
      mockEventBridge({ capabilities: [BridgeCapability.RECORDS, BridgeCapability.PROFILES] })
      const api = makeProfilerApi()
      api.onRumStart(
        new LifeCycle(),
        createHooks(),
        mockRumConfiguration({ profilingSampleRate: 0 }),
        createSessionManagerMock().setId('session-id-1'),
        mockViewHistory(),
        createIdentityEncoder
      )
      await waitNextMicrotask()
      expect(createRumProfilerSpy).toHaveBeenCalled()
    })
  })

  describe('early collection', () => {
    interface MockProfilerInstance {
      stopped: boolean
    }

    let createRumProfilerSpy: jasmine.Spy
    let lazyLoadProfilerSpy: jasmine.Spy
    let isProfilingSupportedSpy: jasmine.Spy
    let instances: Set<unknown>

    /**
     * Emulates what happens in production: the early collection package starts
     * a Profiler at HTML parse, and the SDK claims it at init (see
     * `takeOverEarlyCollection`) for the profiler chunk to adopt.
     */
    function seedEarlyCollectionProfiler(): MockProfilerInstance {
      const ProfilerConstructor = globalObject.Profiler as new (options: {
        sampleInterval: number
        maxBufferSize: number
      }) => MockProfilerInstance
      const profiler = new ProfilerConstructor({ sampleInterval: 10, maxBufferSize: 9000 })
      ;(globalObject as unknown as Record<string, unknown>)[EARLY_COLLECTION_GLOBAL_NAME] = {
        version: 1,
        startClocks: { relative: 1, timeStamp: 2 },
        buffer: [],
        profiler,
        stop: noop,
      }
      // Neutralize the error instrumentation install done by the takeover.
      replaceMockable(trackRuntimeError, () => new Observable<RawError>())
      takeOverEarlyCollection(new LifeCycle())
      return profiler
    }

    function startApi(sessionManager = createSessionManagerMock().setId('session-id-1')) {
      const api = makeProfilerApi()
      api.onRumStart(
        new LifeCycle(),
        createHooks(),
        mockRumConfiguration({ profilingSampleRate: 100 }),
        sessionManager,
        mockViewHistory(),
        createIdentityEncoder
      )
      return api
    }

    beforeEach(() => {
      instances = mockProfiler(deepClone(mockedTrace)).instances
      registerCleanupTask(() => {
        delete (globalObject as unknown as Record<string, unknown>)[EARLY_COLLECTION_GLOBAL_NAME]
        takeEarlyCollectionProfiler() // clear any takeover left by a test
      })
      createRumProfilerSpy = jasmine
        .createSpy('createRumProfiler')
        .and.returnValue({ start: jasmine.createSpy(), stop: jasmine.createSpy() })
      lazyLoadProfilerSpy = replaceMockableWithSpy(lazyLoadProfiler)
      lazyLoadProfilerSpy.and.returnValue(Promise.resolve(createRumProfilerSpy))
      isProfilingSupportedSpy = replaceMockableWithSpy(isProfilingSupported)
      isProfilingSupportedSpy.and.returnValue(true)
    })

    it('loads the profiler chunk when the session is sampled for profiling, without stopping the early Profiler', async () => {
      const earlyProfiler = seedEarlyCollectionProfiler()

      startApi()
      await waitNextMicrotask() // let lazyLoadProfiler().then() run

      expect(lazyLoadProfilerSpy).toHaveBeenCalled()
      expect(createRumProfilerSpy).toHaveBeenCalled()
      expect(earlyProfiler.stopped).toBe(false)
    })

    it('does not create a Profiler instance on its own', async () => {
      // Profiler instances are created by the profiler chunk, or started early
      // by the early collection package: never by the main bundle.
      startApi()
      await waitNextMicrotask() // let lazyLoadProfiler().then() run

      expect(instances.size).toBe(0)
    })

    it('does not load the profiler chunk and stops the early Profiler when the browser does not support the Profiler API', () => {
      isProfilingSupportedSpy.and.returnValue(false)
      const earlyProfiler = seedEarlyCollectionProfiler()

      startApi()

      expect(lazyLoadProfilerSpy).not.toHaveBeenCalled()
      expect(earlyProfiler.stopped).toBeTrue()
      expect(takeEarlyCollectionProfiler()).toBeUndefined()
    })

    it('does not load the profiler chunk and stops the early Profiler when the session is not tracked', () => {
      const earlyProfiler = seedEarlyCollectionProfiler()
      const sessionManager = createSessionManagerMock().setNotTracked()

      startApi(sessionManager)

      expect(lazyLoadProfilerSpy).not.toHaveBeenCalled()
      expect(earlyProfiler.stopped).toBeTrue()
      expect(takeEarlyCollectionProfiler()).toBeUndefined()
    })

    it('does not load the profiler chunk and stops the early Profiler when the session is not sampled for profiling', () => {
      const earlyProfiler = seedEarlyCollectionProfiler()

      const api = makeProfilerApi()
      api.onRumStart(
        new LifeCycle(),
        createHooks(),
        mockRumConfiguration({ sessionSampleRate: 60, profilingSampleRate: 60 }),
        createSessionManagerMock().setId(MID_HASH_UUID),
        mockViewHistory(),
        createIdentityEncoder
      )

      expect(lazyLoadProfilerSpy).not.toHaveBeenCalled()
      expect(earlyProfiler.stopped).toBeTrue()
      expect(takeEarlyCollectionProfiler()).toBeUndefined()
    })

    it('stops the early Profiler when the profiler chunk fails to load', async () => {
      const earlyProfiler = seedEarlyCollectionProfiler()
      lazyLoadProfilerSpy.and.returnValue(Promise.resolve(undefined))

      startApi()
      await waitNextMicrotask() // let lazyLoadProfiler().then() run

      expect(createRumProfilerSpy).not.toHaveBeenCalled()
      expect(earlyProfiler.stopped).toBeTrue()
      expect(takeEarlyCollectionProfiler()).toBeUndefined()
    })

    it('stops the early Profiler when loading the profiler chunk throws', async () => {
      const earlyProfiler = seedEarlyCollectionProfiler()
      lazyLoadProfilerSpy.and.returnValue(Promise.reject(new Error('load error')))

      startApi()
      // The rejection propagates through the `.then().catch()` chain: two microtasks.
      await waitNextMicrotask()
      await waitNextMicrotask()

      expect(earlyProfiler.stopped).toBeTrue()
      expect(takeEarlyCollectionProfiler()).toBeUndefined()
    })

    it('stops the early Profiler when the SDK is stopped before the profiler chunk is loaded', () => {
      const earlyProfiler = seedEarlyCollectionProfiler()

      const api = startApi()
      api.stop()

      expect(earlyProfiler.stopped).toBeTrue()
      expect(takeEarlyCollectionProfiler()).toBeUndefined()
    })
  })
})
