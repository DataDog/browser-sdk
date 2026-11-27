import { BridgeCapability, createIdentityEncoder, display } from '@datadog/browser-core'
import { deepClone, globalObject } from '@datadog/js-core/util'
import type { ProfilerInitOptions } from '@datadog/js-core/util'
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
import { createHooks, LifeCycle, RumEventType } from '@datadog/browser-rum-core'
import type { AssembleHookParams } from '@datadog/browser-rum-core/src/domain/hooks'
import { relativeNow } from '@datadog/js-core/time'
import { mockProfiler } from '../../test'
import { mockedTrace } from '../domain/profiling/test-utils/mockedTrace'
import { EARLY_COLLECTION_GLOBAL_NAME } from '../browser/browserProfiler'
import type { BrowserProfiler } from '../browser/browserProfiler'
import { makeProfilerApi } from './profilerApi'
import { lazyLoadProfiler } from './lazyLoadProfiler'

describe('profilerApi', () => {
  describe('deterministic sampling', () => {
    it('should apply the correction factor for chained sampling on the profiling sample rate', () => {
      // MID_HASH_UUID has a hash of ~50.7%. With sessionSampleRate=60 and profilingSampleRate=60:
      // - Without correction: isSampled(id, 60) → true (50.7 < 60)
      // - With correction: isSampled(id, 60*60/100=36) → false (50.7 > 36)
      const lazyLoadProfilerSpy = replaceMockableWithSpy(lazyLoadProfiler)
      const { instances } = mockProfiler(deepClone(mockedTrace))
      const profilerApi = makeProfilerApi()

      profilerApi.onRumStart(
        new LifeCycle(),
        createHooks(),
        mockRumConfiguration({ sessionSampleRate: 60, profilingSampleRate: 60 }),
        createSessionManagerMock().setId(MID_HASH_UUID),
        mockViewHistory(),
        createIdentityEncoder
      )

      expect(lazyLoadProfilerSpy).not.toHaveBeenCalled()
      expect(instances.size).toBe(0)
    })
  })

  describe('bridge mode', () => {
    let createRumProfilerSpy: jasmine.Spy

    beforeEach(() => {
      createRumProfilerSpy = jasmine
        .createSpy('createRumProfiler')
        .and.returnValue({ start: jasmine.createSpy(), stop: jasmine.createSpy() })
      mockProfiler(deepClone(mockedTrace))
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
    let startProfilerSpy: jasmine.Spy<(browserProfiler: BrowserProfiler) => void>
    let hooks: ReturnType<typeof createHooks>
    let instances: Set<unknown>

    /**
     * Emulates what happens in production: the early collection package starts
     * a Profiler at HTML parse and publishes it on its global.
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
        profiler,
      }
      return profiler
    }

    function startApi(sessionManager = createSessionManagerMock().setId('session-id-1')) {
      const api = makeProfilerApi()
      registerCleanupTask(() => api.stop())
      api.onRumStart(
        new LifeCycle(),
        hooks,
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
      })
      createRumProfilerSpy = jasmine
        .createSpy('createRumProfiler')
        .and.returnValue({ start: jasmine.createSpy(), stop: jasmine.createSpy() })
      startProfilerSpy = jasmine.createSpy('start')
      createRumProfilerSpy.and.returnValue({ start: startProfilerSpy, stop: jasmine.createSpy() })
      lazyLoadProfilerSpy = replaceMockableWithSpy(lazyLoadProfiler)
      lazyLoadProfilerSpy.and.returnValue(Promise.resolve(createRumProfilerSpy))
      hooks = createHooks()
    })

    it('loads the profiler chunk when the session is sampled for profiling, without stopping the early Profiler', async () => {
      const earlyProfiler = seedEarlyCollectionProfiler()

      startApi()
      await waitNextMicrotask() // let lazyLoadProfiler().then() run

      expect(lazyLoadProfilerSpy).toHaveBeenCalled()
      expect(createRumProfilerSpy).toHaveBeenCalled()
      expect(earlyProfiler.stopped).toBe(false)
    })

    it('passes the profiler created before loading into the profiler chunk', async () => {
      startApi()
      expect(instances.size).toBe(1)
      await waitNextMicrotask()

      const browserProfiler = startProfilerSpy.calls.mostRecent().args[0]
      expect(browserProfiler).toBeDefined()
      expect(instances.size).toBe(1)
      await browserProfiler.stop()
      expect(Array.from(instances)).toEqual([jasmine.objectContaining({ stopped: true })])
    })

    function expectStartupError(reason: string) {
      startApi()

      expect(lazyLoadProfilerSpy).not.toHaveBeenCalled()
      expect(
        hooks.assembleEventDefaults.trigger({
          eventType: RumEventType.VIEW,
          startTime: relativeNow(),
        } as AssembleHookParams)
      ).toEqual(
        jasmine.objectContaining({
          _dd: { profiling: { status: 'error', error_reason: reason } },
        })
      )
    }

    it('reports unsupported browsers without loading the profiler chunk', () => {
      globalObject.Profiler = undefined

      expectStartupError('not-supported-by-browser')
    })

    function failProfilerConstruction(message: string) {
      const ProfilerConstructor = globalObject.Profiler
      if (!ProfilerConstructor) {
        throw new Error('Expected the mock Profiler constructor')
      }
      globalObject.Profiler = class extends ProfilerConstructor {
        constructor(options: ProfilerInitOptions) {
          super(options)
          throw new Error(message)
        }
      }
    }

    it('reports a missing document policy without loading the profiler chunk', () => {
      spyOn(display, 'warn')
      failProfilerConstruction('JS profiling is disabled by Document Policy')

      expectStartupError('missing-document-policy-header')
    })

    it('reports unexpected construction failures without loading the profiler chunk', () => {
      failProfilerConstruction('Unexpected construction failure')

      expectStartupError('unexpected-exception')
    })

    it('adopts an early profiler even when its constructor is no longer available', async () => {
      const earlyProfiler = seedEarlyCollectionProfiler()
      globalObject.Profiler = undefined

      startApi()
      await waitNextMicrotask()

      expect(lazyLoadProfilerSpy).toHaveBeenCalled()
      expect(earlyProfiler.stopped).toBeFalse()
      expect(instances.size).toBe(1)
    })

    it('does not load the profiler chunk and stops the early Profiler when the session is not tracked', () => {
      const earlyProfiler = seedEarlyCollectionProfiler()
      const sessionManager = createSessionManagerMock().setNotTracked()

      startApi(sessionManager)

      expect(lazyLoadProfilerSpy).not.toHaveBeenCalled()
      expect(earlyProfiler.stopped).toBeTrue()
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
    })

    it('stops the early Profiler when the profiler chunk fails to load', async () => {
      const earlyProfiler = seedEarlyCollectionProfiler()
      lazyLoadProfilerSpy.and.returnValue(Promise.resolve(undefined))

      startApi()
      await waitNextMicrotask() // let lazyLoadProfiler().then() run

      expect(createRumProfilerSpy).not.toHaveBeenCalled()
      expect(earlyProfiler.stopped).toBeTrue()
    })

    it('stops the early Profiler when loading the profiler chunk throws', async () => {
      const earlyProfiler = seedEarlyCollectionProfiler()
      lazyLoadProfilerSpy.and.returnValue(Promise.reject(new Error('load error')))

      startApi()
      // The rejection propagates through the `.then().catch()` chain: two microtasks.
      await waitNextMicrotask()
      await waitNextMicrotask()

      expect(earlyProfiler.stopped).toBeTrue()
    })

    it('stops the early Profiler and cancels startup when stopped before the chunk loads', async () => {
      const earlyProfiler = seedEarlyCollectionProfiler()

      const api = startApi()
      api.stop()

      expect(earlyProfiler.stopped).toBeTrue()
      await waitNextMicrotask()
      expect(createRumProfilerSpy).not.toHaveBeenCalled()
    })

    it('stops a newly created profiler when loading fails', async () => {
      lazyLoadProfilerSpy.and.returnValue(Promise.resolve(undefined))

      startApi()
      await waitNextMicrotask()

      expect(instances.size).toBe(1)
      expect(Array.from(instances)).toEqual([jasmine.objectContaining({ stopped: true })])
    })
  })
})
