import { deepClone, globalObject } from '@datadog/js-core/util'
import { BridgeCapability, createIdentityEncoder } from '@datadog/browser-core'
import { createHooks, LifeCycle } from '@datadog/browser-rum-core'
import {
  MID_HASH_UUID,
  createSessionManagerMock,
  mockEventBridge,
  registerCleanupTask,
  replaceMockable,
  replaceMockableWithSpy,
  waitNextMicrotask,
} from '@datadog/browser-core/test'
import { mockRumConfiguration, mockViewHistory } from '@datadog/browser-rum-core/test'
import { mockProfiler } from '../../test'
import { EARLY_PROFILER_GLOBAL_NAME } from '../domain/profiling/earlyProfilerConstants'
import { isProfilingSupported } from '../domain/profiling/profilingSupported'
import { mockedTrace } from '../domain/profiling/test-utils/mockedTrace'
import { lazyLoadProfiler } from './lazyLoadProfiler'
import { makeProfilerApi } from './profilerApi'

interface MockProfilerInstance {
  stopped: boolean
}

describe('profilerApi', () => {
  describe('deterministic sampling', () => {
    it('should apply the correction factor for chained sampling on the profiling sample rate', () => {
      // MID_HASH_UUID has a hash of ~50.7%. With sessionSampleRate=60 and profilingSampleRate=60:
      // - Without correction: isSampled(id, 60) → true (50.7 < 60)
      // - With correction: isSampled(id, 60*60/100=36) → false (50.7 > 36)
      const lazyLoadProfilerSpy = replaceMockableWithSpy(lazyLoadProfiler)
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
      expect(lazyLoadProfilerSpy).not.toHaveBeenCalled()
    })
  })

  describe('early profiler snippet', () => {
    let createRumProfilerSpy: jasmine.Spy
    let lazyLoadProfilerSpy: jasmine.Spy
    let isProfilingSupportedSpy: jasmine.Spy
    let instances: Set<unknown>

    function setEarlyProfilerSnippet(): MockProfilerInstance {
      const ProfilerConstructor = globalObject.Profiler as new (options: {
        sampleInterval: number
        maxBufferSize: number
      }) => MockProfilerInstance
      const profiler = new ProfilerConstructor({ sampleInterval: 10, maxBufferSize: 9000 })
      ;(globalObject as unknown as { [key: string]: unknown })[EARLY_PROFILER_GLOBAL_NAME] = {
        profiler,
        startClocks: { relative: 1, timeStamp: 2 },
      }
      return profiler
    }

    function getEarlyProfilerSnippet() {
      return (globalObject as unknown as { [key: string]: unknown })[EARLY_PROFILER_GLOBAL_NAME]
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
        delete (globalObject as unknown as { [key: string]: unknown })[EARLY_PROFILER_GLOBAL_NAME]
      })
      createRumProfilerSpy = jasmine
        .createSpy('createRumProfiler')
        .and.returnValue({ start: jasmine.createSpy(), stop: jasmine.createSpy() })
      lazyLoadProfilerSpy = replaceMockableWithSpy(lazyLoadProfiler)
      lazyLoadProfilerSpy.and.returnValue(Promise.resolve(createRumProfilerSpy))
      isProfilingSupportedSpy = replaceMockableWithSpy(isProfilingSupported)
      isProfilingSupportedSpy.and.returnValue(true)
    })

    it('loads the profiler chunk when the session is sampled for profiling', async () => {
      startApi()
      await waitNextMicrotask() // let lazyLoadProfiler().then() run

      expect(lazyLoadProfilerSpy).toHaveBeenCalled()
      expect(createRumProfilerSpy).toHaveBeenCalled()
    })

    it('does not create a Profiler instance on its own', async () => {
      // Early collection is the snippet's job: without it, the Profiler is only
      // created by the profiler chunk.
      startApi()
      await waitNextMicrotask() // let lazyLoadProfiler().then() run

      expect(instances.size).toBe(0)
    })

    it('does not load the profiler chunk and stops the snippet Profiler when the browser does not support the Profiler API', () => {
      isProfilingSupportedSpy.and.returnValue(false)
      const snippetProfiler = setEarlyProfilerSnippet()

      startApi()

      expect(lazyLoadProfilerSpy).not.toHaveBeenCalled()
      expect(snippetProfiler.stopped).toBeTrue()
      expect(getEarlyProfilerSnippet()).toBeUndefined()
    })

    it('does not load the profiler chunk and stops the snippet Profiler when the session is not tracked', () => {
      const snippetProfiler = setEarlyProfilerSnippet()
      const sessionManager = createSessionManagerMock().setNotTracked()

      startApi(sessionManager)

      expect(lazyLoadProfilerSpy).not.toHaveBeenCalled()
      expect(snippetProfiler.stopped).toBeTrue()
      expect(getEarlyProfilerSnippet()).toBeUndefined()
    })

    it('does not load the profiler chunk and stops the snippet Profiler when the session is not sampled for profiling', () => {
      const snippetProfiler = setEarlyProfilerSnippet()

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
      expect(snippetProfiler.stopped).toBeTrue()
      expect(getEarlyProfilerSnippet()).toBeUndefined()
    })

    it('stops the snippet Profiler when the profiler chunk fails to load', async () => {
      const snippetProfiler = setEarlyProfilerSnippet()
      lazyLoadProfilerSpy.and.returnValue(Promise.resolve(undefined))

      startApi()
      await waitNextMicrotask() // let lazyLoadProfiler().then() run

      expect(createRumProfilerSpy).not.toHaveBeenCalled()
      expect(snippetProfiler.stopped).toBeTrue()
      expect(getEarlyProfilerSnippet()).toBeUndefined()
    })

    it('stops the snippet Profiler when loading the profiler chunk throws', async () => {
      const snippetProfiler = setEarlyProfilerSnippet()
      lazyLoadProfilerSpy.and.returnValue(Promise.reject(new Error('load error')))

      startApi()
      // The rejection propagates through the `.then().catch()` chain: two microtasks.
      await waitNextMicrotask()
      await waitNextMicrotask()

      expect(snippetProfiler.stopped).toBeTrue()
      expect(getEarlyProfilerSnippet()).toBeUndefined()
    })

    it('stops the snippet Profiler when the SDK is stopped before the profiler chunk is loaded', () => {
      const snippetProfiler = setEarlyProfilerSnippet()

      const api = startApi()
      api.stop()

      expect(snippetProfiler.stopped).toBeTrue()
      expect(getEarlyProfilerSnippet()).toBeUndefined()
    })
  })

  describe('bridge mode', () => {
    let createRumProfilerSpy: jasmine.Spy

    beforeEach(() => {
      createRumProfilerSpy = jasmine
        .createSpy('createRumProfiler')
        .and.returnValue({ start: jasmine.createSpy(), stop: jasmine.createSpy() })
      replaceMockable(lazyLoadProfiler, () => Promise.resolve(createRumProfilerSpy))
      replaceMockable(isProfilingSupported, () => true)
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
})
