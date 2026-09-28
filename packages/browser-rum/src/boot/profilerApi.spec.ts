import {
  MID_HASH_UUID,
  replaceMockableWithSpy,
  createSessionManagerMock,
  replaceMockable,
  waitNextMicrotask,
  mockEventBridge,
} from '@datadog/browser-core/test'
import { mockRumConfiguration, mockViewHistory } from '@datadog/browser-rum-core/test'
import { createHooks, LifeCycle } from '@datadog/browser-rum-core'
import { BridgeCapability, createIdentityEncoder } from '@datadog/browser-core'
import type { EarlyProfiler } from '../domain/profiling/types'
import { startEarlyProfiler } from '../domain/profiling/earlyProfiler'
import { makeProfilerApi } from './profilerApi'
import { lazyLoadProfiler } from './lazyLoadProfiler'

describe('profilerApi', () => {
  let startEarlyProfilerSpy: jasmine.Spy
  let earlyProfilerStopSpy: jasmine.Spy
  let earlyProfilerTakeoverSpy: jasmine.Spy

  beforeEach(() => {
    earlyProfilerStopSpy = jasmine.createSpy('earlyProfiler.stop')
    earlyProfilerTakeoverSpy = jasmine.createSpy('earlyProfiler.takeover').and.returnValue(undefined)
    const earlyProfiler: EarlyProfiler = {
      takeover: earlyProfilerTakeoverSpy as EarlyProfiler['takeover'],
      stop: earlyProfilerStopSpy,
    }
    startEarlyProfilerSpy = replaceMockableWithSpy(startEarlyProfiler)
    startEarlyProfilerSpy.and.returnValue({ state: 'started', earlyProfiler })
  })

  describe('deterministic sampling', () => {
    it('should apply the correction factor for chained sampling on the profiling sample rate', () => {
      // MID_HASH_UUID has a hash of ~50.7%. With sessionSampleRate=60 and profilingSampleRate=60:
      // - Without correction: isSampled(id, 60) → true (50.7 < 60)
      // - With correction: isSampled(id, 60*60/100=36) → false (50.7 > 36)
      const profilerApi = makeProfilerApi()

      profilerApi.onRumStart(
        new LifeCycle(),
        createHooks(),
        mockRumConfiguration({ sessionSampleRate: 60, profilingSampleRate: 60 }),
        createSessionManagerMock().setId(MID_HASH_UUID),
        mockViewHistory(),
        createIdentityEncoder
      )

      expect(startEarlyProfilerSpy).not.toHaveBeenCalled()
    })
  })

  describe('early collection', () => {
    let createRumProfilerSpy: jasmine.Spy
    let lazyLoadProfilerSpy: jasmine.Spy
    let earlyProfilerHandle: EarlyProfiler

    beforeEach(() => {
      createRumProfilerSpy = jasmine
        .createSpy('createRumProfiler')
        .and.returnValue({ start: jasmine.createSpy(), stop: jasmine.createSpy() })
      lazyLoadProfilerSpy = jasmine.createSpy('lazyLoadProfiler').and.returnValue(Promise.resolve(createRumProfilerSpy))
      replaceMockable(lazyLoadProfiler, lazyLoadProfilerSpy)
      earlyProfilerHandle = { takeover: earlyProfilerTakeoverSpy as EarlyProfiler['takeover'], stop: earlyProfilerStopSpy }
      startEarlyProfilerSpy.and.returnValue({ state: 'started', earlyProfiler: earlyProfilerHandle })
    })

    function startApi() {
      const api = makeProfilerApi()
      api.onRumStart(
        new LifeCycle(),
        createHooks(),
        mockRumConfiguration({ profilingSampleRate: 100 }),
        createSessionManagerMock().setId('session-id-1'),
        mockViewHistory(),
        createIdentityEncoder
      )
      return api
    }

    it('starts early collection synchronously, before the profiler chunk is loaded', () => {
      lazyLoadProfilerSpy.and.callFake(() => {
        expect(startEarlyProfilerSpy).toHaveBeenCalled()
        return Promise.resolve(createRumProfilerSpy)
      })

      startApi()

      expect(startEarlyProfilerSpy).toHaveBeenCalled()
      expect(lazyLoadProfilerSpy).toHaveBeenCalled()
    })

    it('passes the early profiler to the profiler chunk so it can take over early collection', async () => {
      startApi()
      await waitNextMicrotask() // let lazyLoadProfiler().then() run

      expect(createRumProfilerSpy).toHaveBeenCalled()
      expect(createRumProfilerSpy.calls.argsFor(0)[6]).toBe(earlyProfilerHandle)
    })

    it('does not stop the early collector once the profiler chunk took over', async () => {
      const profilerStopSpy = jasmine.createSpy('profiler.stop')
      createRumProfilerSpy.and.returnValue({ start: jasmine.createSpy(), stop: profilerStopSpy })
      const api = startApi()
      await waitNextMicrotask() // let lazyLoadProfiler().then() run

      api.stop()

      // The profiler chunk took over early collection: stopping the SDK goes through it.
      expect(earlyProfilerStopSpy).not.toHaveBeenCalled()
      expect(profilerStopSpy).toHaveBeenCalled()
    })

    it('does not load the profiler chunk when the early profiler fails to start', () => {
      startEarlyProfilerSpy.and.returnValue({ state: 'error', errorReason: 'not-supported-by-browser' })

      startApi()

      expect(lazyLoadProfilerSpy).not.toHaveBeenCalled()
    })

    it('stops the early collector when the profiler chunk fails to load', async () => {
      lazyLoadProfilerSpy.and.returnValue(Promise.resolve(undefined))

      startApi()
      await waitNextMicrotask()

      expect(earlyProfilerStopSpy).toHaveBeenCalled()
      expect(createRumProfilerSpy).not.toHaveBeenCalled()
    })

    it('stops the early collector when loading the profiler chunk throws', async () => {
      lazyLoadProfilerSpy.and.returnValue(Promise.reject(new Error('load error')))

      startApi()
      // The rejection propagates through the `.then().catch()` chain: two microtasks.
      await waitNextMicrotask()
      await waitNextMicrotask()

      expect(earlyProfilerStopSpy).toHaveBeenCalled()
      expect(createRumProfilerSpy).not.toHaveBeenCalled()
    })

    it('stops the early collector when the SDK is stopped before the profiler chunk is loaded', () => {
      const api = startApi()

      api.stop()

      expect(earlyProfilerStopSpy).toHaveBeenCalled()
    })
  })

  describe('bridge mode', () => {
    let createRumProfilerSpy: jasmine.Spy

    beforeEach(() => {
      createRumProfilerSpy = jasmine
        .createSpy('createRumProfiler')
        .and.returnValue({ start: jasmine.createSpy(), stop: jasmine.createSpy() })
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
})
